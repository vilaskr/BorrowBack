export type EntryStatus = 'REQUESTED' | 'ACTIVE' | 'RETURN_REQUESTED' | 'RETURNED' | 'CANCELLED';

export interface BorrowEntry {
  id: string;
  itemName: string;
  lenderID: string;
  borrowerID?: string;
  lenderEmail: string;
  borrowerEmail: string;
  lenderName: string;
  borrowerName?: string;
  status: EntryStatus;
  createdAt: any; // Firestore Timestamp
  returnDate?: any; // Firestore Timestamp
  notes?: string;
  returnRequestedBy?: string;
  lastReminderSentAt?: any; // Firestore Timestamp
  lastReminderTone?: 'friendly' | 'casual' | 'strict';
  reminderCount?: number;
  totalAmount?: number; // For partial returns
  returnedAmount?: number; // For partial returns
  isMonetary?: boolean;
  hiddenByLender?: boolean;
  hiddenByBorrower?: boolean;
}

export interface Friend {
  id: string;
  name: string;
  email: string;
  addedBy: string;
  trustScore?: number; // 0-5
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
  badges?: string[];
}
