export type UserRole = "owner" | "worker" | "admin";
export type KycStatus = "none" | "pending" | "approved" | "rejected";
export type JobStatus = "open" | "in_progress" | "completed" | "cancelled" | "disputed";
export type ApplicationStatus = "pending" | "accepted" | "rejected" | "withdrawn";
export type ContractStatus = "draft" | "active" | "completed" | "cancelled" | "disputed";
export type PaymentMode = "milestone" | "full";
export type MilestoneStatus =
  | "pending" | "funded" | "in_progress" | "submitted"
  | "approved" | "released" | "disputed" | "refunded";
export type TransactionStatus = "pending" | "success" | "failed" | "abandoned";
export type DisputeStatus = "open" | "under_review" | "resolved_release" | "resolved_refund" | "closed";
export type NotificationType =
  | "new_message" | "milestone_funded" | "milestone_completed"
  | "payment_released" | "dispute_created" | "contract_created"
  | "application_accepted" | "application_rejected";

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  role: UserRole;
  email_verified: boolean;
  phone_verified: boolean;
  kyc_level: number;
  kyc_status: KycStatus;
  skills: string[];
  location: string | null;
  rating: number;
  total_jobs: number;
  is_active: boolean;
  is_banned: boolean;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  category: string;
  sub_category: string | null;
  budget_min: number | null;
  budget_max: number | null;
  location: string | null;
  is_remote: boolean;
  skills_needed: string[];
  status: JobStatus;
  views: number;
  created_at: string;
  updated_at: string;
  owner?: User;
  applications?: Application[];
}

export interface Application {
  id: string;
  job_id: string;
  worker_id: string;
  cover_letter: string | null;
  proposed_price: number | null;
  proposed_days: number | null;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
  worker?: User;
  job?: Job;
}

export interface Contract {
  id: string;
  job_id: string;
  owner_id: string;
  worker_id: string;
  application_id: string | null;
  payment_mode: PaymentMode;
  total_price: number;
  platform_fee: number;
  net_amount: number;
  currency: string;
  status: ContractStatus;
  version: number;
  terms: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
  job?: Job;
  owner?: User;
  worker?: User;
  milestones?: Milestone[];
  escrow_wallet?: EscrowWallet;
}

export interface Milestone {
  id: string;
  contract_id: string;
  title: string;
  description: string | null;
  amount: number;
  due_date: string | null;
  order_index: number;
  status: MilestoneStatus;
  funded_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  released_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EscrowWallet {
  id: string;
  contract_id: string;
  balance: number;
  locked_balance: number;
  released_total: number;
  refunded_total: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  message_type: "text" | "system" | "contract_proposal" | "file";
  is_read: boolean;
  is_deleted: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  sender?: User;
}

export interface ChatRoom {
  id: string;
  job_id: string;
  contract_id: string | null;
  owner_id: string;
  worker_id: string;
  is_locked: boolean;
  created_at: string;
  job?: Job;
  owner?: User;
  worker?: User;
}

export interface Dispute {
  id: string;
  contract_id: string;
  milestone_id: string | null;
  raised_by: string;
  reason: string;
  evidence_urls: string[];
  status: DisputeStatus;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
}