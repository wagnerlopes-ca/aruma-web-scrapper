import { Table, Model, Column, PrimaryKey } from 'sequelize-typescript';

@Table({ timestamps: false })
export class DeviceUsers extends Model {
  @PrimaryKey
  @Column
  DeviceName: string;
    
  @Column
  IsActive: boolean;
  
  @Column
  ClientName: string;

  @Column
  Customer: string;

  @Column
  Email: string;
    
  @Column
  SendEmailOnNotification: boolean;
  
  @Column
  OrganizationId: string;

  @Column
  ClientId: string;

  @Column
  Password: string;

  @Column
  Certificate: string;

  @Column
  Token: string;

  @Column
  WebhookUrl: string;

  @Column
  WebhookBasicAuth: string;
}