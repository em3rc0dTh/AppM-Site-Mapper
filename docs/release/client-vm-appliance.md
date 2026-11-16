# Site Mapper MK1 — Client VM / Appliance Baseline

**Status:** sizing baseline approved for client VM planning. This document defines the current minimum target and operating thresholds; it does **not** by itself certify a production site.

## 1. Baseline requested from the client

| Resource     |                                                        Baseline |
| ------------ | --------------------------------------------------------------: |
| Architecture |                                                  x86_64 / amd64 |
| CPU          |                                                      **4 vCPU** |
| RAM          |                                                       **16 GB** |
| Virtual disk |     **200 GB SSD**, thin-provisioned when supported, expandable |
| OS           |                                         Ubuntu Server 24.04 LTS |
| Network      |           fixed addressing/DNS/NTP according to the site design |
| Hypervisor   | VMware, Hyper-V or KVM/Proxmox; export format chosen per client |

The virtual disk must be expandable without rebuilding Site Mapper.

## 2. Why this baseline

The baseline is derived from the current TFARM04 engineering host, not from a generic cloud template.

Observed reference:

- 4 physical CPU cores;
- about 7.8 GB physical RAM;
- snapshot CPU usage around 24% total with about 76% idle;
- about 3.8 GB RAM used by the whole workstation, including desktop/remote-access processes not required by a headless appliance;
- Docker images around 6 GB;
- current persistent MongoDB + TimescaleDB data around 633 MB.

Therefore:

- **4 vCPU** are sufficient for the currently observed workload and avoid unjustified over-sizing;
- **16 GB RAM** doubles the current physical capacity and gives room for MongoDB/Timescale caches, peaks and upgrades;
- **200 GB disk** is primarily for historical telemetry, logs, upgrades and operational headroom, not because the application itself needs 200 GB to boot.

Expected clean appliance occupation is approximately **20–25 GB**. The exact exported OVA/QCOW2/VHDX size is release-dependent and must be recorded when the Golden Appliance is built.

## 3. Storage operating policy

The client VM is managed against the following filesystem thresholds:

|      Usage | State      | Required action                                                     |
| ---------: | ---------- | ------------------------------------------------------------------- |
|      < 70% | NORMAL     | No capacity action                                                  |
|     70–79% | WARNING    | Review growth trend and available expansion                         |
| **80–89%** | **ACTION** | Expand storage or apply the approved retention/archive plan         |
|     90–94% | CRITICAL   | Immediate capacity intervention                                     |
|     >= 95% | EMERGENCY  | Protect writes/services and recover capacity under operator control |

**The 80% threshold is an action threshold, not an automatic delete trigger.**

Site Mapper must never delete customer history merely because the filesystem reaches 80%.

### Current retention semantics

- Industrial Mongo evidence/history uses `INDUSTRIAL_RETENTION_DAYS`; the current default is **90 days**.
- The Site Mapper-owned Timescale historical hypertables do **not** currently have a general automatic deletion policy.
- Pending outbox/spool data must not be deleted merely to free space.

If Timescale reaches a full filesystem without intervention, new historical writes can fail and durable queues/outboxes can accumulate. Production operation therefore requires monitoring and an approved expand/retain/archive decision before disk exhaustion.

## 4. Capacity planning assumption

Until enough FIELD data is measured, planning uses **200 MB/day** as the conservative working estimate, with a reasonable planning band of roughly **100–300 MB/day** for a workload comparable to the current installation.

For a 200 GB virtual disk:

- operational ceiling at 80% = about **160 GB**;
- subtract about 25 GB for OS/runtime/application;
- about **135 GB** remain for growth before the 80% action threshold.

At the 200 MB/day planning value, 135 GB represents approximately **675 days (~22 months)**.

This is a planning estimate, not a contractual retention guarantee. The actual rate must be recalculated from measured MongoDB + TimescaleDB growth after commissioning.

## 5. Scaling path

Storage scales first while ingest/concurrency remain comparable:

1. **200 GB** — baseline;
2. **500 GB** — next capacity tier;
3. **1 TB** — high-retention/high-history tier.

CPU/RAM do not need to increase merely because historical storage increases.

Move toward **8 vCPU / 32 GB RAM** when measured ingest rate, concurrent users, historical queries or collectors materially exceed the current reference workload.

## 6. Preflight

Run the read-only preflight before commissioning:

```bash
bash scripts/release/client-vm-preflight.sh
```

The script validates architecture, CPU, memory, usable root filesystem capacity, Docker/Compose availability and the 70/80/90 storage thresholds. It does not install packages, delete data, resize disks or change networking.

A VM may still require site-specific acceptance for DNS, TLS, OT routes, MQTT/SNMP, Modbus/Metasys, secrets, backup target and restore evidence.

## 7. Golden Appliance and transport media

The appliance can expose a **200 GB thin/sparse virtual disk** while the exported artifact remains much smaller.

Planning values:

- clean appliance used space: ~20–25 GB;
- expected single exported appliance: ~15–25 GB, to be replaced by the measured release size;
- minimum practical transport: 64 GB USB 3.x;
- **recommended transport: 256 GB external SSD USB 3.2**;
- 512 GB external SSD when carrying multiple VM formats, backups and release evidence.

Do not use FAT32 for a release artifact that can exceed 4 GB. Use a filesystem suitable for large files and the client import workflow.

The transport package should include the appliance, `SHA256SUMS`, release manifest, installation/operations documentation and any approved initial backup. Secrets are delivered separately and are never baked into the Golden Appliance.

## 8. Confidence

| Decision                          |    Current confidence |
| --------------------------------- | --------------------: |
| 4 vCPU                            |        high (~90–95%) |
| 16 GB RAM                         |      very high (~95%) |
| clean appliance ~20–25 GB         |        high (~85–90%) |
| 200 GB initial disk               | medium-high (~75–80%) |
| 500 GB / 1 TB scaling path        |                  high |
| 256 GB external SSD for transport |             very high |

The main remaining uncertainty is daily historical growth after real commissioning. Replace the planning estimate with measured MB/day once enough operational data exists.

## 9. Release boundary

This sizing does not change the existing rule that the client release should use prebuilt immutable images, a Compose without `build:`, private configuration/secrets and tested backup/restore.

Related documents:

- [Docker/VPS distribution contract](docker-vps-distribution.md)
- [Clean Host Installation](clean-host-installation.md)
- [Portability hardening](portability-hardening.md)
- [Backup and Restore](../operations/backup-restore.md)
