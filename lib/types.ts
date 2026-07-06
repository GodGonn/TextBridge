export type BridgeMessage = {
  id: string;
  room_id: string;
  text: string;
  type: "text" | "link" | "code" | "email" | "phone";
  is_pinned: boolean;
  created_at: string;
  expired_at: string | null;
  deleted_at: string | null;
};

export type Room = {
  id: string;
  code: string;
  name: string | null;
  password: string | null;
  created_at: string;
  expired_at: string | null;
  created_by: string | null;
  is_private: boolean;
};

export type RoomView = Omit<Room, "password"> & {
  requires_password: boolean;
  storage_mode: "supabase" | "local";
};

export type BridgeFile = {
  id: string;
  room_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  created_at: string;
  expired_at: string | null;
  deleted_at: string | null;
};
