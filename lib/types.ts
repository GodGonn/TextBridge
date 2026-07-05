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
