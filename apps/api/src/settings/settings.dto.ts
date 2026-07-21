import { IsDefined, IsString, Length, Matches } from 'class-validator';

export class SetSettingDto {
  @IsString() @Matches(/^[a-z][a-z0-9_.-]+$/) @Length(2, 80) key!: string;
  @IsDefined() value!: unknown;
}
