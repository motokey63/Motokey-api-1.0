export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  email: string;
}

export interface ApiResult<T = any> {
  ok: boolean;
  status: number;
  data: T;
}
