export type AttendanceStatus = 'none' | 'present' | 'absent' | 'late' | 'disruption' | 'positive';
export type AppMode = 'edit' | 'lesson';

export interface Student {
  id: string;
  name: string;
  attendance: AttendanceStatus;
  avatar?: any; // Avatar configuration
  seatRow?: number;
  seatCol?: number;
}

export interface ClassroomConfig {
  rows: number;
  cols: number;
  className: string;
}
