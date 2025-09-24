import { Table, Column, Model, PrimaryKey, AutoIncrement } from 'sequelize-typescript';

@Table({ timestamps: false })
export class PlannedOutages extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column
  Id: number;

  @Column
  StartDateTime: Date;

  @Column
  EndDateTime: Date;
}
