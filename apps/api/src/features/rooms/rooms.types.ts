export interface RoomRow {
  id: string;
  room_name: string;
  meeting_url: string | null;
  owner_id: string;
  created_at: string;
}

export interface RoomDomain {
  id: string;
  roomName: string;
  meetingUrl: string | null;
  ownerId: string;
  createdAt: string;
}

export interface CreateRoomParameters {
  roomName: string;
  meetingUrl?: string | undefined;
  ownerId: string;
}
