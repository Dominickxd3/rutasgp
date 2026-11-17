export interface MobileLoginInput {
  username: string;
  password: string;
  deviceId: string | null;
}

export interface MobileLoginUser {
  username: string;
  fullName: string;
  email: string;
  role: string;
  isAdmin: boolean;
}

export interface MobileLoginResult {
  success: true;
  token: string;
  expiresAt: string;
  user: MobileLoginUser;
}
