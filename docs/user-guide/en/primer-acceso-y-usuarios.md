# 0 · First sign-in and user administration

**Goal:** sign in for the first time, understand account roles and protect credentials.

> Site Mapper has no public registration on Login. An authorized administrator provisions accounts. Never include passwords in screenshots, training files or support tickets.

## First login (STANDARD, ADMIN or SUPERADMIN)

1. Confirm an administrator has created your account and privately delivered its email and temporary password.
2. Open your organization's approved Site Mapper URL. On a local machine: http://localhost:3000/login.
3. Enter **Email** and **Password**; select **SIGN IN**.
4. When **Change password** appears, enter **Current password** and a **New password** of at least 12 characters, then select **Change password**.
5. This change revokes prior sessions. Sign in again with your new password.
6. Confirm that **Workspace** opens and only the operations allowed by your role are shown.

**Expected:** successful login, correct Workspace and a replaced temporary password.

**If login fails:** check the authorized URL/email, then contact account administration. The reviewed interface has no public email password-recovery workflow. Do not edit MongoDB or disclose passwords.

## SUPERADMIN: create and manage users

Only **SUPERADMIN** has the users:manage permission. **ADMIN** cannot open the Users management tab.

1. Sign in as an authorized SUPERADMIN.
2. Open **ADMIN → Settings → Users** (or /settings?tab=users).
3. Expand **+ ADD USER**.
4. Fill **Name**, unique **Email**, authorized **Role** (Standard, Admin or Superadmin) and a private **Temporary password** with 12 or more characters.
5. Select **Create user**, confirm the new account appears as **ACTIVE**, and deliver credentials securely.

In **Settings → Users**, SUPERADMIN may change roles or switch users between **ACTIVE** and **ARCHIVED**. Archiving blocks access; role/status changes revoke sessions. The interface protects your own row, and the backend prevents disabling or demoting the **last active SUPERADMIN**. The three-dot row action toggles status: identify the user before clicking it.

## Roles at a glance

| Action | STANDARD | ADMIN | SUPERADMIN |
| --- | :---: | :---: | :---: |
| Read topology, power and telemetry | Yes | Yes | Yes |
| Edit topology and PowerPaths | No | Yes | Yes |
| Confirm verified Panel commissioning | No | Yes | Yes |
| Create and manage users | No | No | Yes |
| Change own password | Yes | Yes | Yes |

A missing edit button often means an intentional **permission restriction**, not a broken page.

## First SUPERADMIN on an empty installation

A token-protected bootstrap API provisions the initial SUPERADMIN. It is an administrator deployment task, **not** a public Login feature. After the first user exists bootstrap becomes unavailable.

## Training evidence

Capture real Login, Change password, Users, Create user and archive/restore screens in an authorized test installation only; mask all passwords. Screenshots not yet captured remain marked **PENDING** in the visual-evidence catalogue.

**Pass:** a beginner can sign in, replace an initial password, sign in again, open Workspace and explain the role-based controls without assistance.

[Next: concepts](conceptos.md) · [Complete manual](manual-maestro.md).
