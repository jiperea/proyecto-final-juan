import type { Role } from '../../domain/model';

// DTOs de respuesta (nombres externos snake_case) — derivados del contrato OpenAPI 3.1.
export interface UserIdentityDto {
  id: string;
  email: string;
  username: string;
  role: Role;
}

export interface LoginResponseDto {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: UserIdentityDto;
}

export interface MeResponseDto {
  user: UserIdentityDto;
}

export interface ProbeResponseDto {
  id: string;
  ok: true;
}
