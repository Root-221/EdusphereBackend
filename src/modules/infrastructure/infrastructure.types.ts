export const BuildingStatusEnum = {
  active: 'active',
  maintenance: 'maintenance',
  inactive: 'inactive',
} as const;

export type BuildingStatus = (typeof BuildingStatusEnum)[keyof typeof BuildingStatusEnum];

export const RoomStatusEnum = BuildingStatusEnum;

export type RoomStatus = BuildingStatus;

export const RoomTypeEnum = {
  classe: 'classe',
  laboratoire: 'laboratoire',
  informatique: 'informatique',
  bibliotheque: 'bibliotheque',
  cantine: 'cantine',
  bureau: 'bureau',
  salle_reunion: 'salle_reunion',
  gymnase: 'gymnase',
  terrain: 'terrain',
  sanitaire: 'sanitaire',
  autre: 'autre',
} as const;

export type RoomType = (typeof RoomTypeEnum)[keyof typeof RoomTypeEnum];

export const BUILDING_STATUS_VALUES = Object.values(BuildingStatusEnum);
export const ROOM_STATUS_VALUES = Object.values(RoomStatusEnum);
export const ROOM_TYPE_VALUES = Object.values(RoomTypeEnum);
