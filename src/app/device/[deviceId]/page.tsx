import '@/app/front-01.css';
import { Front01StageTabs } from '@/components/workspace/front-01-stage-tabs';
import { Front01EquipmentSummary } from '@/components/workspace/front-01-equipment-summary';
import {
  isInternalEquipment,
  isOperationallyVisible,
} from '@/modules/topology/application/equipment-visibility';
import { ResizableWorkspace } from '@/components/workspace/resizable-workspace';
import { ThradexAttribution } from '@/shared/ui/thradex-attribution';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { EquipmentCompositionEditor } from '@/components/equipment/equipment-composition-editor';
import { DeleteEntityControl } from '@/components/topology/delete-entity-control';
import { EquipmentFocusInspector } from '@/components/equipment/equipment-focus-inspector';
import { AccessPortEditor } from '@/components/equipment/access-port-editor';
import { FullPowerTraceModal } from '@/components/power/full-power-trace-modal';
import { PowerContractEditor } from '@/components/power/power-contract-editor';
import { RackElevation } from '@/components/rack/rack-elevation';
import { EquipmentTelemetryInspector } from '@/components/telemetry/equipment-telemetry-inspector';
import { AlarmScopeSummary } from '@/components/alarm/alarm-scope-summary';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
import { TopologyContextTree } from '@/components/topology/context-tree';
import { ContextPin } from '@/components/workspace/context-pin';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';
import { PowerContractService } from '@/modules/inventory/application/power-contract-service';
import { createCommunicationProfileRepository } from '@/modules/industrial/infrastructure/communication-profile-repository';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { RackElevationService } from '@/modules/rack/application/rack-elevation-service';
import type { PortConnectionView } from '@/modules/power/domain/port-connection-view';
import { readBreakerProtection } from '@/modules/power/domain/breaker-protection';
import { TopologyService } from '@/modules/topology/application/topology-service';
import type { EquipmentNode } from '@/modules/topology/domain/entities';
import { rawPointForPosition } from '@/modules/topology/domain/telemetry-point-prefix';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export default async function DevicePage({ params }: { params: Promise<{ deviceId: string }> }) {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) redirect('/login');

  const canWritePower = hasPermission(auth.value.role, 'power:write');
  const canWriteTopology = hasPermission(auth.value.role, 'topology:write');
  const canDelete = hasPermission(auth.value.role, 'system:danger');
  const canReadTelemetry = hasPermission(auth.value.role, 'telemetry:read');
  const canReadIndustrialSettings = hasPermission(auth.value.role, 'settings:read');
  const { deviceId } = await params;
  const repo = await createTopologyRepository();
  const service = new TopologyService(repo);
  const node = await repo.getById(deviceId);
  if (
    !node ||
    (node.kind !== 'DEVICE' && node.kind !== 'EQUIPMENT') ||
    node.lifecycle !== 'ACTIVE'
  ) {
    notFound();
  }

  // Internal industrial assets remain accessible by authorized technical staff only.
  if (isInternalEquipment(node) && !canReadIndustrialSettings) notFound();

  if (node.kind === 'DEVICE' && node.deviceType === 'BDFB') {
    redirect(await service.buildDeepLink(node.id));
  }

  const owningDeviceId = node.kind === 'DEVICE' ? node.id : node.deviceId;
  const directEquipmentChildren =
    node.kind === 'EQUIPMENT'
      ? (await service.listChildren(node.id)).filter(
          (child): child is EquipmentNode =>
            child.kind === 'EQUIPMENT' &&
            (isOperationallyVisible(child) || isInternalEquipment(node)),
        )
      : [];
  const deviceEquipment = (await repo.listEquipmentForDevice(owningDeviceId)).filter(
    (item) =>
      item.lifecycle === 'ACTIVE' && (isOperationallyVisible(item) || isInternalEquipment(node)),
  );
  const familyEquipment: readonly EquipmentNode[] =
    node.kind === 'DEVICE'
      ? deviceEquipment
      : deviceEquipment.filter((item) => {
          let current: EquipmentNode | undefined = item;
          const byId = new Map(deviceEquipment.map((candidate) => [candidate.id, candidate]));
          const visited = new Set<string>();
          while (current && !visited.has(current.id)) {
            if (current.id === node.id) return true;
            visited.add(current.id);
            current = current.parentEquipmentId ? byId.get(current.parentEquipmentId) : undefined;
          }
          return false;
        });

  const physical =
    node.kind === 'EQUIPMENT' && node.rackPlacement
      ? node
      : familyEquipment.find((item) => item.rackPlacement);

  const owningDevice = node.kind === 'DEVICE' ? node : await repo.getById(node.deviceId);
  const physicalRack = physical?.rackPlacement
    ? await repo.getById(physical.rackPlacement.rackId)
    : null;
  const contextualRack =
    !physicalRack && owningDevice?.kind === 'DEVICE' && owningDevice.parentId
      ? await repo.getById(owningDevice.parentId)
      : null;
  const rackNode =
    physicalRack?.kind === 'CONTAINER_RACK'
      ? physicalRack
      : contextualRack?.kind === 'CONTAINER_RACK'
        ? contextualRack
        : null;
  const contextTrail = rackNode
    ? await service.getTrail(rackNode.id)
    : await service.getTrail(node.id);
  const room = contextTrail.find((item) => item.kind === 'ROOM_SUBSTRUCTURE');
  const nodeTrail = await service.getTrail(node.id);
  const tree = nodeTrail[0] ? await service.buildNavigationTree(nodeTrail[0].id) : null;
  const view = rackNode ? await new RackElevationService(repo).getView(rackNode.id) : null;

  // The focused scope may contain breakers several Equipment levels below.
  // Load explicit bindings for the whole focused subtree, never by slot number.
  const breakerIds = familyEquipment
    .filter((item) => item.lifecycle === 'ACTIVE' && item.equipmentType === 'CIRCUIT_BREAKER')
    .map((item) => item.id);
  const breakerTelemetryBindings =
    canReadTelemetry && breakerIds.length
      ? (await (await createTelemetryBindingRepository()).listForTargets('EQUIPMENT', breakerIds))
          .filter((binding) => binding.lifecycle === 'ACTIVE' && binding.protocol === 'MQTT')
          .map((binding) => ({
            id: binding.id,
            targetId: binding.targetId,
            sourceIdentity: binding.sourceIdentity,
            ...(binding.sourcePointId ? { sourcePointId: binding.sourcePointId } : {}),
            metric: binding.metric,
          }))
      : [];

  const parentPanel =
    node.kind === 'EQUIPMENT' && node.equipmentType === 'CIRCUIT_BREAKER' && node.parentEquipmentId
      ? (deviceEquipment.find(
          (item) =>
            item.id === node.parentEquipmentId &&
            item.lifecycle === 'ACTIVE' &&
            item.equipmentType === 'PANEL',
        ) ?? null)
      : null;
  const breakerPosition =
    parentPanel && node.kind === 'EQUIPMENT'
      ? parentPanel.children.findIndex((childId) => childId === node.id) + 1
      : 0;
  const expectedPanelPoint =
    parentPanel?.telemetryPointPrefix && breakerPosition > 0
      ? rawPointForPosition(parentPanel.telemetryPointPrefix, breakerPosition)
      : null;
  const focusedPointBinding =
    node.kind === 'EQUIPMENT' && node.equipmentType === 'CIRCUIT_BREAKER'
      ? breakerTelemetryBindings.find(
          (binding) => binding.targetId === node.id && Boolean(binding.sourcePointId),
        )
      : undefined;
  const focusedDirectSource =
    node.kind === 'EQUIPMENT' && node.equipmentType === 'CIRCUIT_BREAKER'
      ? breakerTelemetryBindings.find(
          (binding) =>
            binding.targetId === node.id &&
            !binding.sourcePointId &&
            binding.metric.toUpperCase() === 'SOURCE',
        )
      : undefined;
  const panelBindingMetrics =
    parentPanel?.serialNumber && expectedPanelPoint && node.kind === 'EQUIPMENT'
      ? new Set(
          breakerTelemetryBindings
            .filter(
              (binding) =>
                binding.targetId === node.id &&
                binding.sourceIdentity === parentPanel.serialNumber &&
                binding.sourcePointId === expectedPanelPoint,
            )
            .map((binding) => binding.metric.toUpperCase()),
        )
      : new Set<string>();
  const panelBindingConfirmed = ['VOLTAGE', 'CURRENT', 'POWER', 'ENERGY'].every((metric) =>
    panelBindingMetrics.has(metric),
  );

  let acrelMapping: {
    sourceIdentity: string;
    rawPointId: string;
    channel: number;
    confirmedBy: string;
    confirmedAt: string;
    evidence?: { projectId?: string; documentName?: string; revision?: string; reference?: string };
    gatewayName: string;
    meterName: string;
    gatewayAlias?: string;
    meterAlias?: string;
    macAddress?: string;
    loginUsername?: string;
    credentialState?: string;
    recordStatus?: string;
    gatewayNumber?: string;
    meterNumber?: string;
    network?: {
      ip: string;
      mask: string;
      gateway: string;
      services: readonly { protocol: string; port?: number }[];
    };
    rs485?: {
      baudRate: number;
      dataBits: number;
      parity: string;
      stopBits: number;
      slaveId?: number;
    };
  } | null = null;

  if (
    canReadIndustrialSettings &&
    node.kind === 'EQUIPMENT' &&
    node.equipmentType === 'CIRCUIT_BREAKER'
  ) {
    const bindingRepository = await createTelemetryBindingRepository();
    const confirmed = (await bindingRepository.listForTarget('EQUIPMENT', node.id)).find(
      (binding) =>
        binding.lifecycle === 'ACTIVE' &&
        binding.protocol === 'MQTT' &&
        binding.sourcePointId &&
        binding.attributes?.commissioning === 'ACREL_VERIFIED_CHANNEL',
    );
    if (confirmed?.sourcePointId) {
      const attrs = confirmed.attributes ?? {};
      const meterId = typeof attrs.meterEquipmentId === 'string' ? attrs.meterEquipmentId : '';
      const gatewayId =
        typeof attrs.gatewayEquipmentId === 'string' ? attrs.gatewayEquipmentId : '';
      const channel = typeof attrs.channel === 'number' ? attrs.channel : Number.NaN;
      const confirmedBy = typeof attrs.confirmedBy === 'string' ? attrs.confirmedBy : '';
      const confirmedAt = typeof attrs.confirmedAt === 'string' ? attrs.confirmedAt : '';
      const evidence =
        attrs.evidence && typeof attrs.evidence === 'object' && !Array.isArray(attrs.evidence)
          ? (attrs.evidence as {
              projectId?: string;
              documentName?: string;
              revision?: string;
              reference?: string;
            })
          : undefined;
      if (meterId && gatewayId && Number.isInteger(channel) && confirmedBy && confirmedAt) {
        const profileRepository = await createCommunicationProfileRepository();
        const [meterProfile, gatewayProfile, meterNode, gatewayNode] = await Promise.all([
          profileRepository.get(meterId),
          profileRepository.get(gatewayId),
          repo.getById(meterId),
          repo.getById(gatewayId),
        ]);
        if (
          meterProfile?.role === 'METER' &&
          gatewayProfile?.role === 'GATEWAY' &&
          meterProfile.gatewayEquipmentId === gatewayId
        ) {
          acrelMapping = {
            sourceIdentity: confirmed.sourceIdentity,
            rawPointId: confirmed.sourcePointId,
            channel,
            confirmedBy,
            confirmedAt,
            ...(evidence ? { evidence } : {}),
            gatewayName:
              gatewayNode?.kind === 'EQUIPMENT' ? gatewayNode.name : gatewayProfile.equipmentId,
            meterName: meterNode?.kind === 'EQUIPMENT' ? meterNode.name : meterProfile.equipmentId,
            ...(gatewayNode?.kind === 'EQUIPMENT' && gatewayNode.aliases?.[0]
              ? { gatewayAlias: gatewayNode.aliases[0] }
              : {}),
            ...(meterNode?.kind === 'EQUIPMENT' && meterNode.aliases?.[0]
              ? { meterAlias: meterNode.aliases[0] }
              : {}),
            ...(gatewayProfile.macAddress ? { macAddress: gatewayProfile.macAddress } : {}),
            ...(gatewayProfile.loginUsername
              ? { loginUsername: gatewayProfile.loginUsername }
              : {}),
            ...(gatewayProfile.credentialState
              ? { credentialState: gatewayProfile.credentialState }
              : {}),
            recordStatus:
              gatewayProfile.recordStatus === 'FIELD_VERIFIED' &&
              meterProfile.recordStatus === 'FIELD_VERIFIED'
                ? 'FIELD_VERIFIED'
                : 'DECLARED',
            ...(gatewayProfile.gatewayNumber
              ? { gatewayNumber: gatewayProfile.gatewayNumber }
              : {}),
            ...(meterProfile.meterNumber ? { meterNumber: meterProfile.meterNumber } : {}),
            ...(gatewayProfile.network ? { network: gatewayProfile.network } : {}),
            rs485: meterProfile.rs485,
          };
        }
      }
    }
  }

  const familyPortIds = new Set(
    familyEquipment.flatMap((item) =>
      item.accessPorts.filter((port) => port.lifecycle === 'ACTIVE').map((port) => port.id),
    ),
  );
  const relatedPower = (await (await createPowerRepository()).listActive()).filter(
    (path) =>
      familyPortIds.has(path.sourceAccessPortId) || familyPortIds.has(path.targetAccessPortId),
  );
  const ownPortIds = new Set(
    node.kind === 'EQUIPMENT'
      ? node.accessPorts.filter((port) => port.lifecycle === 'ACTIVE').map((port) => port.id)
      : [],
  );
  const ownConnections = relatedPower.filter(
    (path) => ownPortIds.has(path.sourceAccessPortId) || ownPortIds.has(path.targetAccessPortId),
  );
  const portConnections: PortConnectionView[] = await Promise.all(
    ownConnections.map(async (path): Promise<PortConnectionView> => {
      const outgoing = ownPortIds.has(path.sourceAccessPortId);
      const peerId = outgoing ? path.targetAccessPortId : path.sourceAccessPortId;
      const peerEquipment = await repo.getEquipmentByAccessPortId(peerId);
      const peerPort = peerEquipment?.accessPorts.find((port) => port.id === peerId);
      return {
        portId: outgoing ? path.sourceAccessPortId : path.targetAccessPortId,
        pathId: path.id,
        flow: outgoing ? 'OUTGOING' : 'INCOMING',
        peerEquipmentId: peerEquipment?.id ?? '',
        peerEquipmentName: peerEquipment?.name ?? 'Unknown Equipment',
        peerPortName: peerPort?.name ?? peerId,
        ...(path.feed ? { feed: path.feed } : {}),
      };
    }),
  );
  const hasFeedA = relatedPower.some((path) => path.feed === 'A');
  const hasFeedB = relatedPower.some((path) => path.feed === 'B');
  const contract = await new PowerContractService(repo).get(node.id);

  const placement = physical?.rackPlacement;
  const mountLabel =
    placement?.mode === 'U_RANGE' && placement.startU !== undefined && placement.sizeU !== undefined
      ? `U${placement.startU} – U${placement.startU + placement.sizeU - 1}`
      : placement?.mode === 'FULL_RACK'
        ? 'Full rack'
        : 'Not mounted';

  const links = await Promise.all(
    nodeTrail.map(async (item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      href: await service.buildDeepLink(item.id),
    })),
  );
  const breadcrumbIds = [
    room?.id,
    owningDevice?.kind === 'DEVICE' ? owningDevice.id : undefined,
    node.kind === 'EQUIPMENT' ? (node.parentEquipmentId ?? undefined) : undefined,
    node.id,
  ].filter((id): id is string => Boolean(id));
  const breadcrumbLinks = [...new Set(breadcrumbIds)].flatMap((id) => {
    const link = links.find((item) => item.id === id);
    return link ? [link] : [];
  });

  const breakerProtection =
    node.kind === 'EQUIPMENT' && node.equipmentType === 'CIRCUIT_BREAKER'
      ? readBreakerProtection(node.attributes)
      : null;
  const t = await getTranslations('pages.device');
  const tBreaker = await getTranslations('breakerLimits');
  return (
    <main className="operational-page mk-device-page">
      <nav className="breadcrumbs zip-device-breadcrumbs" aria-label={t('breadcrumbs')}>
        {breadcrumbLinks.map((item, index) => (
          <span className="zip-device-breadcrumb-item" key={item.id}>
            {index > 0 ? <span className="zip-device-breadcrumb-separator">›</span> : null}
            {item.id === node.id ? (
              <strong aria-current="page">{item.name}</strong>
            ) : (
              <Link href={item.href}>{item.name}</Link>
            )}
          </span>
        ))}
      </nav>

      <ResizableWorkspace className="mk-device-layout" userKey={auth.value.id}>
        <aside>{tree && <TopologyContextTree tree={tree} activeId={node.id} />}</aside>

        <section className="zip-device-stage">
          <h1>{node.kind === 'EQUIPMENT' ? t('composition') : t('elevation')}</h1>
          {node.kind === 'DEVICE' && canDelete ? (
            <DeleteEntityControl id={node.id} name={node.name} />
          ) : null}
          {node.kind === 'EQUIPMENT' ? (
            <Front01StageTabs
              label="Vistas del Equipment"
              physical={<><EquipmentCompositionEditor
              equipment={node}
              childEquipment={directEquipmentChildren}
              familyEquipment={familyEquipment}
              canWrite={canWriteTopology}
              canDelete={canDelete}
              canWritePower={canWritePower}
              canReadTelemetry={canReadTelemetry}
              breakerTelemetryBindings={breakerTelemetryBindings}
              portConnections={portConnections}
            /></>}
              operation={<><EquipmentFocusInspector
              equipment={node}
              familyEquipment={familyEquipment}
              bindings={breakerTelemetryBindings}
              canReadTelemetry={canReadTelemetry}
              overview={
                <>
                  <ContextPin entityId={node.id} />
                  <dl>
                    <dt>{t('identity')}</dt>
                    <dd>{node.name}</dd>
                    <dt>{t('type')}</dt>
                    <dd>{node.equipmentType.replaceAll('_', ' ')}</dd>
                    <dt>{t('model')}</dt>
                    <dd>{node.model ?? node.category ?? t('notSpecified')}</dd>
                    <dt>{t('serial')}</dt>
                    <dd>{node.serialNumber ?? t('notAssigned')}</dd>
                    <dt>{t('mk1_part_number_p_n')}</dt>
                    <dd>{node.partNumber ?? t('notSpecified')}</dd>
                    <dt>{t('mk1_aliases')}</dt>
                    <dd>{node.aliases?.length ? node.aliases.join(', ') : t('notSpecified')}</dd>
                    <dt>{t('parent')}</dt>
                    <dd>{node.parentEquipmentId ?? t('deviceRoot')}</dd>
                    <dt>{t('childCapacity')}</dt>
                    <dd>{node.childMode === 'POSITIONAL' ? node.children.length : t('dynamic')}</dd>
                    {node.equipmentType === 'CIRCUIT_BREAKER' ? (
                      breakerProtection ? (
                        <>
                          <dt>{t('breakerNominal')}</dt>
                          <dd>
                            {t('breakerNominalValue', { value: breakerProtection.ratedCurrentA })}
                          </dd>
                          <dt>{t('breakerAlarm')}</dt>
                          <dd>
                            {t('breakerAlarmValue', { value: breakerProtection.assertAboveA })}
                          </dd>
                          <dt>{t('breakerClear')}</dt>
                          <dd>
                            {t('breakerClearValue', { value: breakerProtection.clearBelowA })}
                          </dd>
                          <dt>{t('breakerRatingSource')}</dt>
                          <dd>
                            {tBreaker(`sources.${breakerProtection.provenance.source}`)} ·{' '}
                            {breakerProtection.provenance.verified
                              ? t('breakerVerified')
                              : t('breakerProvisional')}
                          </dd>
                          <dt>{t('breakerUpdated')}</dt>
                          <dd>{breakerProtection.updatedAt || '—'}</dd>
                        </>
                      ) : (
                        <>
                          <dt>{t('breakerProtection')}</dt>
                          <dd>{t('breakerNotConfigured')}</dd>
                        </>
                      )
                    ) : null}
                    {node.equipmentType === 'PANEL' ? (
                      <>
                        <dt>{t('mk1_telemetry_role')}</dt>
                        <dd>{t('mk1_logical_measurement_source_for_child_breakers')}</dd>
                        <dt>{t('mk1_telemetry_source_s_n')}</dt>
                        <dd>{node.serialNumber ?? '—'}</dd>
                        <dt>{t('mk1_telemetry_point_prefix')}</dt>
                        <dd>{node.telemetryPointPrefix ?? '—'}</dd>
                        <dt>{t('mk1_telemetry_readiness')}</dt>
                        <dd>
                          {node.childMode === 'POSITIONAL' &&
                          node.serialNumber &&
                          node.telemetryPointPrefix
                            ? 'READY FOR EXPLICIT COMMISSIONING'
                            : 'NOT READY'}
                        </dd>
                      </>
                    ) : null}
                    <dt>{t('location')}</dt>
                    <dd>
                      {room?.name ?? t('room')} / {rackNode?.name ?? t('rack')} / {mountLabel}
                    </dd>
                    <dt>{t('powerA')}</dt>
                    <dd>{hasFeedA ? t('pathRecorded') : t('noPath')}</dd>
                    <dt>{t('powerB')}</dt>
                    <dd>{hasFeedB ? t('pathRecorded') : t('noPath')}</dd>
                    {node.equipmentType === 'CIRCUIT_BREAKER' && canReadTelemetry ? (
                      <>
                        <dt>{t('mk1_measurement_model')}</dt>
                        <dd>
                          {focusedDirectSource && !focusedPointBinding && !acrelMapping
                            ? 'SELF-MEASURED'
                            : acrelMapping || focusedPointBinding || parentPanel
                              ? 'EXTERNALLY-MEASURED'
                              : 'UNCOMMISSIONED'}
                        </dd>
                        <dt>{t('mk1_measured_via')}</dt>
                        <dd>
                          {acrelMapping
                            ? `${acrelMapping.gatewayAlias ?? acrelMapping.gatewayName} → ${acrelMapping.meterAlias ?? acrelMapping.meterName} → CH ${acrelMapping.channel}`
                            : focusedDirectSource && !focusedPointBinding
                              ? `Self source · ${focusedDirectSource.sourceIdentity}`
                              : panelBindingConfirmed && parentPanel
                                ? `${parentPanel.name} → position ${String(breakerPosition).padStart(2, '0')}`
                                : focusedPointBinding
                                  ? `Explicit MQTT binding · ${focusedPointBinding.sourceIdentity}`
                                  : parentPanel
                                    ? `${parentPanel.name} → telemetry not commissioned`
                                    : 'No measurement source commissioned'}
                        </dd>
                        {parentPanel && !acrelMapping ? (
                          <>
                            <dt>{t('mk1_panel_source_s_n')}</dt>
                            <dd>{parentPanel.serialNumber ?? '—'}</dd>
                            <dt>{t('mk1_panel_point_prefix')}</dt>
                            <dd>{parentPanel.telemetryPointPrefix ?? '—'}</dd>
                            <dt>{t('mk1_physical_position')}</dt>
                            <dd>
                              {breakerPosition > 0 ? String(breakerPosition).padStart(2, '0') : '—'}
                            </dd>
                            <dt>{t('mk1_resolved_raw_point')}</dt>
                            <dd>{expectedPanelPoint ?? '—'}</dd>
                            <dt>{t('mk1_binding')}</dt>
                            <dd>{panelBindingConfirmed ? 'CONFIRMED' : 'NOT COMMISSIONED'}</dd>
                          </>
                        ) : null}
                      </>
                    ) : null}
                    {node.equipmentType === 'CIRCUIT_BREAKER' && canReadIndustrialSettings ? (
                      acrelMapping ? (
                        <>
                          <dt>{t('mk1_acrel_measurement_path')}</dt>
                          <dd>
                            {acrelMapping.gatewayAlias ?? acrelMapping.gatewayName}
                            {acrelMapping.gatewayNumber
                              ? ' #' + acrelMapping.gatewayNumber
                              : ''} → {acrelMapping.meterAlias ?? acrelMapping.meterName}
                            {acrelMapping.meterNumber ? ' ' + acrelMapping.meterNumber : ''}{' '}
                            {t('mk1_ch')} {acrelMapping.channel} → {acrelMapping.rawPointId}
                          </dd>
                          <dt>{t('mk1_transport_source')}</dt>
                          <dd>{acrelMapping.sourceIdentity}</dd>
                          <dt>{t('mk1_commissioning_status')}</dt>
                          <dd>{acrelMapping.recordStatus ?? 'DECLARED'}</dd>
                          <dt>{t('mk1_mac_gateway')}</dt>
                          <dd>{acrelMapping.macAddress ?? '—'}</dd>
                          <dt>{t('mk1_login_gateway')}</dt>
                          <dd>{acrelMapping.loginUsername ?? '—'}</dd>
                          <dt>{t('mk1_credential_note')}</dt>
                          <dd>{acrelMapping.credentialState ?? 'NOT_DECLARED'}</dd>
                          {acrelMapping.network ? (
                            <>
                              <dt>{t('mk1_gateway_network')}</dt>
                              <dd>
                                {acrelMapping.network.ip} {t('mk1_mask')}{' '}
                                {acrelMapping.network.mask} {t('mk1_gw')}{' '}
                                {acrelMapping.network.gateway} ·{' '}
                                {acrelMapping.network.services
                                  .map(
                                    (service) =>
                                      service.protocol + (service.port ? ':' + service.port : ''),
                                  )
                                  .join(' + ')}
                              </dd>
                            </>
                          ) : null}
                          {acrelMapping.rs485 ? (
                            <>
                              <dt>{t('mk1_rs485_modbus_rtu')}</dt>
                              <dd>
                                {t('mk1_slave')} {acrelMapping.rs485.slaveId ?? '—'} ·{' '}
                                {acrelMapping.rs485.baudRate} · {acrelMapping.rs485.dataBits}
                                {acrelMapping.rs485.parity === 'NONE'
                                  ? 'N'
                                  : acrelMapping.rs485.parity === 'EVEN'
                                    ? 'E'
                                    : 'O'}
                                {acrelMapping.rs485.stopBits}
                              </dd>
                            </>
                          ) : null}
                          <dt>{t('mk1_evidence')}</dt>
                          <dd>
                            {acrelMapping.evidence?.projectId ?? '—'} ·{' '}
                            {acrelMapping.evidence?.documentName ?? '—'} {t('mk1_rev')}{' '}
                            {acrelMapping.evidence?.revision ?? '—'}
                          </dd>
                          <dt>{t('mk1_confirmation')}</dt>
                          <dd>
                            {acrelMapping.confirmedAt} {t('mk1_user')} {acrelMapping.confirmedBy}
                          </dd>
                        </>
                      ) : (
                        <>
                          <dt>{t('mk1_acrel_measurement_path')}</dt>
                          <dd>{t('mk1_no_confirmed_acrel_physical_mapping')}</dd>
                        </>
                      )
                    ) : null}
                  </dl>
                  {node.equipmentType === 'CIRCUIT_BREAKER' && canReadIndustrialSettings ? (
                    <Link
                      className="zip-device-outline"
                      href={
                        '/industrial/commissioning?' +
                        new URLSearchParams({ deviceId: node.deviceId }).toString()
                      }
                    >
                      {acrelMapping ? 'Abrir comisionamiento Acrel' : 'Configurar monitoreo Acrel'}
                    </Link>
                  ) : null}
                  <FullPowerTraceModal entityId={node.id} />
                  {room && rackNode ? (
                    <Link
                      className="zip-device-outline"
                      href={`/blueprint/${room.id}?rack=${rackNode.id}`}
                    >
                      {t('locate')}
                    </Link>
                  ) : null}
                </>
              }
              ports={
                <>
                  <p className="ec-inspector-note">
                    {t('terminals', {
                      count: node.accessPorts.filter((port) => port.lifecycle === 'ACTIVE').length,
                    })}
                  </p>
                  {node.accessPorts
                    .filter((port) => port.lifecycle === 'ACTIVE')
                    .map((port) => (
                      <div className="ec-inspector-port" key={port.id}>
                        <strong>{port.name}</strong>
                        <span>
                          {port.portType} · {port.direction ?? t('directionUnknown')}
                        </span>
                      </div>
                    ))}
                  {canWriteTopology ? (
                    <AccessPortEditor
                      equipmentId={node.id}
                      accessPorts={node.accessPorts}
                      canWritePower={canWritePower}
                      portConnections={portConnections}
                    />
                  ) : null}
                </>
              }
              settings={
                <>
                  <p className="ec-inspector-note">{t('settingsHelp')}</p>
                  {canWritePower && contract.ok ? (
                    <PowerContractEditor
                      entityId={node.id}
                      accessPorts={contract.value.accessPorts}
                      redundancy={contract.value.redundancy}
                    />
                  ) : null}
                  {!relatedPower.length ? (
                    <p className="device-power-unconfigured">{t('noDirect')}</p>
                  ) : null}
                  <FullPowerTraceModal entityId={node.id} />
                </>
              }
            /></>}
            />          ) : view?.ok ? (
            <RackElevation
              view={view.value}
              {...(physical?.id ? { focusDeviceId: physical.id } : {})}
            />
          ) : (
            <p>{t('noRack')}</p>
          )}
        </section>

        <aside className="mk-inline-inspector zip-device-inspector">
          {node.kind === 'EQUIPMENT' ? (
            <Front01EquipmentSummary
              equipment={node}
              location={`${room?.name ?? t('room')} / ${rackNode?.name ?? t('rack')} / ${mountLabel}`}
            />          ) : (
            <>
              <header>
                {node.kind} <span>⌄</span>
              </header>
              <div className="zip-device-identity">
                <span>▥</span>
                <div>
                  <h2>{node.name}</h2>
                  <small>
                    {room?.name ?? t('room')} / {rackNode?.name ?? t('rack')} / {mountLabel}
                  </small>
                </div>
              </div>

              <ContextPin entityId={node.id} />
              <AlarmScopeSummary entityId={node.id} scopeLabel={node.name} />

              <dl>
                <dt>{t('identity')}</dt>
                <dd>{node.name}</dd>
                <dt>{t('model')}</dt>
                <dd>{node.category ?? t('notSpecified')}</dd>
                <dt>{t('serial')}</dt>
                <dd>{node.serialNumber ?? t('notAssigned')}</dd>
                <dt>{t('rack')}</dt>
                <dd>{rackNode?.name ?? t('noContext')}</dd>
                <dt>{t('placement')}</dt>
                <dd>
                  {placement
                    ? `${rackNode?.name ?? placement.rackId} · ${mountLabel}`
                    : rackNode
                      ? t('rackContext')
                      : t('noPlacement')}
                </dd>
                <dt>{t('powerA')}</dt>
                <dd>{hasFeedA ? t('pathRecorded') : t('noPath')}</dd>
                <dt>{t('powerB')}</dt>
                <dd>{hasFeedB ? t('pathRecorded') : t('noPath')}</dd>
                <dt>{t('telemetry')}</dt>
                <dd>{t('diagnostic')}</dd>
              </dl>

              <FullPowerTraceModal entityId={node.id} />

              {canWritePower && contract.ok ? (
                <PowerContractEditor
                  entityId={node.id}
                  accessPorts={contract.value.accessPorts}
                  redundancy={contract.value.redundancy}
                />
              ) : null}

              {!relatedPower.length ? (
                <p className="device-power-unconfigured">{t('noDirectDevice')}</p>
              ) : null}

              <div className="zip-device-live">
                <EquipmentTelemetryInspector key={node.id} targetId={node.id} label={node.name} />
              </div>

              {room && rackNode ? (
                <Link
                  className="zip-device-outline"
                  href={`/blueprint/${room.id}?rack=${rackNode.id}`}
                >
                  {t('locate')}
                </Link>
              ) : null}
            </>
          )}
          <ThradexAttribution variant="inspector" />
        </aside>
      </ResizableWorkspace>
    </main>
  );
}
