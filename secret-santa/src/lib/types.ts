export type Profile = {
  id: string;
  display_name: string;
  avatar_path: string | null;
  google_avatar_url: string | null;
};

export type Party = {
  id: string;
  name: string;
  owner_id: string;
  budget: string | null;
  exchange_date: string | null;
  note: string | null;
  drawn_at: string | null;
  pairs_changed_at: string | null;
};

export type Wish = {
  id: string;
  user_id: string;
  title: string;
  url: string | null;
  price: string | null;
  note: string | null;
  position: number;
};
