import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ADMIN_ROLE_NAMES, type SystemRole } from '../constants/roles.constant';
import { EMPLOYEE_RESTRICTED_PERMISSIONS } from '../constants/restricted-actions.constant';

export function generateSecureToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

@Injectable()
export class SecurityUtil {
  generateSecureToken(byteLength = 32): string {
    return generateSecureToken(byteLength);
  }

  sha256(value: string): string {
    return sha256(value);
  }

  safeEqual(left: string, right: string): boolean {
    return safeEqual(left, right);
  }

  isAdminRole(roleName: string | null | undefined): boolean {
    return roleName ? ADMIN_ROLE_NAMES.includes(roleName as SystemRole) : false;
  }

  isEmployeeRestrictedPermission(permission: string): boolean {
    return EMPLOYEE_RESTRICTED_PERMISSIONS.has(permission);
  }

  hasAllPermissions(
    grantedPermissions: Iterable<string>,
    requiredPermissions: readonly string[],
  ): boolean {
    const granted = new Set(grantedPermissions);
    return requiredPermissions.every((permission) => granted.has(permission));
  }
}
