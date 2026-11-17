export interface RoomRow {
  id: string;
  room_name: string;
  meeting_url: string | null;
  owner_id: string;
  invite_code: string;
  created_at: string;
}

export interface RoomDomain {
  id: string;
  roomName: string;
  meetingUrl: string | null;
  ownerId: string;
  inviteCode: string;
  createdAt: string;
}
