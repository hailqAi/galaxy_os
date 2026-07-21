import { IsEmail, IsString, Length } from 'class-validator';

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @Length(1, 128) password!: string;
}

export class ChangePasswordDto {
  @IsString() @Length(1, 128) currentPassword!: string;
  @IsString() @Length(15, 128) newPassword!: string;
  @IsString() @Length(15, 128) confirmNewPassword!: string;
}

export class ForgotPasswordDto {
  @IsEmail() email!: string;
}

export class CompleteResetPasswordDto {
  @IsString() @Length(32, 256) token!: string;
  @IsString() @Length(15, 128) newPassword!: string;
  @IsString() @Length(15, 128) confirmNewPassword!: string;
}
