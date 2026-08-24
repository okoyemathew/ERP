import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY } from '../constants/auth-metadata.constant';
import type { SystemRole } from '../constants/roles.constant';

export const Roles = (...roles: SystemRole[]) => SetMetadata(ROLES_KEY, roles);
