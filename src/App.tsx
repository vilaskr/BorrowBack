/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  addDoc,
  updateDoc,
  Timestamp,
  writeBatch,
  deleteDoc
} from './firebase';
import { UserProfile, BorrowEntry, EntryStatus, Friend } from './types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Toaster, toast } from 'sonner';
import { 
  Plus, 
  LogOut, 
  Search, 
  ArrowUpRight, 
  Calendar as CalendarIcon,
  UserPlus,
  Users,
  Star,
  MessageCircle,
  AlertCircle,
  CheckCircle2,
  Trophy,
  Trash2
} from 'lucide-react';
import { format, formatDistanceToNow, isAfter, differenceInDays } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CustomCursor } from '../src/components/CustomCursor';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<BorrowEntry[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<Friend[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [isLendDialogOpen, setIsLendDialogOpen] = useState(false);
  const [isAddFriendDialogOpen, setIsAddFriendDialogOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isClearInventoryOpen, setIsClearInventoryOpen] = useState(false);
  const [dropdownSearchQuery, setDropdownSearchQuery] = useState('');
  const [isSelectFriendOpen, setIsSelectFriendOpen] = useState(false);
  const [loadingFriends, setLoadingFriends] = useState(true);

  // Track seen reminders to avoid duplicate toasts
  const seenReminders = React.useRef<Set<string>>(new Set());
  const notificationSounds = React.useRef<Record<string, HTMLAudioElement>>({});

  useEffect(() => {
    const sounds = {
      friendly: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
      casual: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
      strict: 'https://assets.mixkit.co/active_storage/sfx/951/951-preview.mp3'
    };

    Object.entries(sounds).forEach(([tone, url]) => {
      const audio = new Audio(url);
      audio.load();
      notificationSounds.current[tone] = audio;
    });
    
    // Request notification permission
    if (typeof window !== 'undefined' && "Notification" in window && Notification.permission === "default") {
      try {
        Notification.requestPermission?.();
      } catch (e) {
        console.warn("Notification.requestPermission failed:", e);
      }
    }
  }, []);

  const sendEmailNotification = async (email: string, subject: string, message: string) => {
    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, subject, message }),
      });
    } catch (error) {
      console.error("Failed to send email notification:", error);
    }
  };

  const triggerNotification = (title: string, body: string, tone: 'friendly' | 'casual' | 'strict' = 'friendly') => {
    try {
      // Play preloaded sound based on tone
      const audio = notificationSounds.current[tone];
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.warn("Sound play blocked:", e));
      }

      // System notification
      if (typeof window !== 'undefined' && "Notification" in window) {
        try {
          if (Notification.permission === "granted" && typeof Notification === 'function') {
            new Notification(title, {
              body,
              icon: '/favicon.ico'
            });
          }
        } catch (e) {
          console.warn("System notification failed:", e);
        }
      }

      // Toast
      toast.message(title, {
        description: body,
        icon: <MessageCircle className={cn("w-5 h-5", 
          tone === 'strict' ? "text-status-overdue" : 
          tone === 'casual' ? "text-orange-500" : "text-accent"
        )} />,
        duration: 5000,
      });
    } catch (error) {
      console.error("Error in triggerNotification:", error);
    }
  };

  // Form state for new entry
  const [newItemName, setNewItemName] = useState('');
  const [newBorrowerEmail, setNewBorrowerEmail] = useState('');
  const [newBorrowerName, setNewBorrowerName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newReturnDate, setNewReturnDate] = useState<Date | undefined>(undefined);
  const [isMonetary, setIsMonetary] = useState(false);
  const [totalAmount, setTotalAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Form state for new friend
  const [friendName, setFriendName] = useState('');
  const [friendEmail, setFriendEmail] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userProfile: UserProfile = {
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || 'Anonymous',
          email: firebaseUser.email || '',
          photoURL: firebaseUser.photoURL || undefined,
        };
        setUser(userProfile);
        
        // Save user to Firestore
        await setDoc(doc(db, 'users', firebaseUser.uid), userProfile, { merge: true });
      } else {
        setUser(null);
      }
      setLoading(false);
      setIsLoggingIn(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setEntries([]);
      return;
    }

    // Listen for entries where user is lender
    const qLender = query(collection(db, 'borrowEntries'), where('lenderID', '==', user.uid));
    const unsubscribeLender = onSnapshot(qLender, (snapshot) => {
      const lenderEntries = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as BorrowEntry))
        .filter(e => !e.hiddenByLender);
      setEntries(prev => {
        const otherEntries = prev.filter(e => e.lenderID !== user.uid);
        return [...otherEntries, ...lenderEntries];
      });
    }, (error) => console.error("Lender listener error:", error));

    // Listen for entries where user is borrower (by email)
    const qBorrower = query(collection(db, 'borrowEntries'), where('borrowerEmail', '==', user.email));
    const unsubscribeBorrower = onSnapshot(qBorrower, (snapshot) => {
      const borrowerEntries = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as BorrowEntry))
        .filter(e => !e.hiddenByBorrower);
      setEntries(prev => {
        const otherEntries = prev.filter(e => e.borrowerEmail !== user.email);
        return [...otherEntries, ...borrowerEntries];
      });
    }, (error) => console.error("Borrower listener error:", error));

    // Listen for friends
    const qFriends = query(collection(db, 'friends'), where('addedBy', '==', user.uid));
    const unsubscribeFriends = onSnapshot(qFriends, (snapshot) => {
      const friendsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Friend));
      setFriends(friendsList);
      setLoadingFriends(false);
    });

    // Listen for friend requests
    const qRequests = query(collection(db, 'friends'), where('email', '==', user.email), where('status', '==', 'PENDING'));
    const unsubscribeRequests = onSnapshot(qRequests, (snapshot) => {
      const requestsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Friend));
      setFriendRequests(requestsList);
    });

    return () => {
      unsubscribeLender();
      unsubscribeBorrower();
      unsubscribeFriends();
      unsubscribeRequests();
    };
  }, [user]);

  // Notification logic for borrower
  useEffect(() => {
    if (!user) return;
    
    try {
      const borrowerEntries = entries.filter(e => e.borrowerEmail === user.email && e.status === 'ACTIVE');
      borrowerEntries.forEach(entry => {
        if (entry.lastReminderSentAt && typeof entry.lastReminderSentAt.toDate === 'function') {
          const seconds = entry.lastReminderSentAt.seconds || 0;
          const reminderId = `${entry.id}_${seconds}`;
          
          if (!seenReminders.current.has(reminderId)) {
            const reminderTime = entry.lastReminderSentAt.toDate().getTime();
            const now = Date.now();
            
            // If reminder was sent in the last 30 seconds, show a notification
            if (now - reminderTime < 30000) {
              const tone = entry.lastReminderTone || 'friendly';
              const messages: Record<string, string> = {
                friendly: `They sent a friendly nudge about "${entry.itemName}".`,
                casual: `Just checking in on the "${entry.itemName}".`,
                strict: `URGENT: Return requested for "${entry.itemName}".`
              };

              triggerNotification(
                `Reminder from ${entry.lenderName}`,
                messages[tone],
                tone
              );
              seenReminders.current.add(reminderId);
            }
          }
        }
      });
    } catch (error) {
      console.error("Error in notification effect:", error);
    }
  }, [entries, user]);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      // Use signInWithPopup as primary method
      await signInWithPopup(auth, googleProvider);
      toast.success('Logged in successfully');
    } catch (error: any) {
      console.error('Login error:', error);
      setIsLoggingIn(false);
      
      // If popup is blocked or closed, provide helpful feedback
      if (error.code === 'auth/popup-closed-by-user') {
        toast.error('Login popup was closed. Please try again.');
      } else if (error.code === 'auth/unauthorized-domain') {
        toast.error('This domain is not authorized in Firebase Console. Please add your Vercel domain to Authorized Domains.');
      } else {
        toast.error('Failed to login. Please check your connection or try again.');
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Failed to logout');
    }
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !friendName || !friendEmail) return;

    try {
      const newFriend: Omit<Friend, 'id'> = {
        name: friendName,
        email: friendEmail.toLowerCase().trim(),
        addedBy: user.uid,
        trustScore: 5.0, // Initial trust score
        status: 'PENDING',
        requesterEmail: user.email || '',
        requesterName: user.name || 'Someone',
      };

      await addDoc(collection(db, 'friends'), newFriend);
      toast.success('Friend request sent!');
      setIsAddFriendDialogOpen(false);
      setFriendName('');
      setFriendEmail('');
    } catch (error) {
      console.error('Add friend error:', error);
      toast.error('Failed to send friend request');
    }
  };

  const handleAcceptFriendRequest = async (request: Friend) => {
    if (!user) return;
    try {
      // Fetch requester's user document to ensure we have their email and name
      let requesterEmail = request.requesterEmail;
      let requesterName = request.requesterName;

      if (!requesterEmail || !requesterName) {
        const userDoc = await getDoc(doc(db, 'users', request.addedBy));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          requesterEmail = requesterEmail || userData.email;
          requesterName = requesterName || userData.name;
        }
      }

      // Update the original request to ACCEPTED
      await updateDoc(doc(db, 'friends', request.id), {
        status: 'ACCEPTED'
      });

      // Create a reciprocal friend entry for the current user
      const reciprocalFriend: Omit<Friend, 'id'> = {
        name: requesterName || requesterEmail || 'Friend',
        email: requesterEmail || 'unknown@example.com', // Fallback to pass validation if still missing
        addedBy: user.uid,
        trustScore: 5.0,
        status: 'ACCEPTED'
      };
      await addDoc(collection(db, 'friends'), reciprocalFriend);
      
      toast.success('Friend request accepted!');
    } catch (error) {
      console.error('Accept friend error:', error);
      toast.error('Failed to accept friend request');
    }
  };

  const handleRejectFriendRequest = async (requestId: string) => {
    try {
      await deleteDoc(doc(db, 'friends', requestId));
      toast.success('Friend request rejected');
    } catch (error) {
      console.error('Reject friend error:', error);
      toast.error('Failed to reject friend request');
    }
  };

  const handleLendItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newItemName || !newBorrowerEmail) return;

    setIsSubmitting(true);
    try {
      const newEntry: any = {
        itemName: newItemName,
        lenderID: user.uid,
        lenderEmail: user.email,
        lenderName: user.name,
        borrowerEmail: newBorrowerEmail.toLowerCase().trim(),
        borrowerName: newBorrowerName,
        status: 'REQUESTED',
        createdAt: serverTimestamp(),
        notes: newNotes,
        returnDate: newReturnDate ? Timestamp.fromDate(newReturnDate) : null,
        isMonetary: isMonetary,
      };

      if (isMonetary) {
        newEntry.totalAmount = parseFloat(totalAmount) || 0;
        newEntry.returnedAmount = 0;
      }

      await addDoc(collection(db, 'borrowEntries'), newEntry);
      toast.success('Lend request sent!');
      setIsLendDialogOpen(false);
      setNewItemName('');
      setNewBorrowerEmail('');
      setNewBorrowerName('');
      setNewNotes('');
      setNewReturnDate(undefined);
      setIsMonetary(false);
      setTotalAmount('');
    } catch (error) {
      console.error('Lend error:', error);
      toast.error('Failed to send request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateEntryStatus = async (entryId: string, newStatus: EntryStatus, extraData: any = {}) => {
    try {
      await updateDoc(doc(db, 'borrowEntries', entryId), {
        status: newStatus,
        ...extraData
      });

      // If status is RETURNED, update trust score for the borrower
      if (newStatus === 'RETURNED') {
        try {
          const entrySnap = await getDoc(doc(db, 'borrowEntries', entryId));
          if (entrySnap.exists()) {
            const entryData = entrySnap.data() as BorrowEntry;
            const friendsRef = collection(db, 'friends');
            const q = query(friendsRef, 
              where('addedBy', '==', entryData.lenderID), 
              where('email', '==', entryData.borrowerEmail)
            );
            const friendSnap = await getDocs(q);
            
            if (!friendSnap.empty) {
              const friendDoc = friendSnap.docs[0];
              const currentScore = friendDoc.data().trustScore || 5.0;
              
              let adjustment = 0.2; // Base increase for returning
              
              // Performance based adjustment
              if (entryData.returnDate && typeof entryData.returnDate.toDate === 'function') {
                const dueDate = entryData.returnDate.toDate();
                if (isAfter(new Date(), dueDate)) {
                  const daysLate = differenceInDays(new Date(), dueDate);
                  adjustment = -Math.min(daysLate * 0.2, 2.5); // Heavier penalty for lateness
                } else {
                  // Bonus for early return
                  const daysEarly = differenceInDays(dueDate, new Date());
                  if (daysEarly >= 1) adjustment += 0.1;
                }
              }

              // Penalty for reminders needed
              const reminderCount = (entryData as any).reminderCount || 0;
              if (reminderCount > 0) {
                adjustment -= reminderCount * 0.15;
              }
              
              const newScore = Math.max(0, Math.min(5, currentScore + adjustment));
              await updateDoc(friendDoc.ref, { trustScore: newScore });
              
              if (adjustment < 0) {
                toast.error(`Trust score decreased for borrower due to performance.`);
              } else {
                toast.success(`Trust score improved!`);
              }
            }
          }
        } catch (scoreError) {
          console.warn("Trust score update failed (non-critical):", scoreError);
          // Don't fail the whole operation if just the trust score update fails
        }
      }

      toast.success(`Status updated to ${newStatus.toLowerCase().replace('_', ' ')}`);
    } catch (error: any) {
      console.error('Update error:', error);
      const errorMessage = error?.message?.includes('permission-denied') 
        ? 'Permission denied. You might not have access to this item.' 
        : 'Failed to update status. Please try again.';
      toast.error(errorMessage);
    }
  };

  const clearInventory = async () => {
    if (!user) return;
    
    try {
      const myLent = entries.filter(e => e.lenderID === user.uid && !e.hiddenByLender);
      const myBorrowed = entries.filter(e => e.borrowerEmail === user.email && !e.hiddenByBorrower);
      const allToHide = [...myLent, ...myBorrowed];
      
      if (allToHide.length === 0) {
        toast.info("Inventory is already empty");
        return;
      }

      const batch = writeBatch(db);
      const uniqueEntries = new Map<string, BorrowEntry>();
      allToHide.forEach(e => uniqueEntries.set(e.id, e));

      uniqueEntries.forEach((entry, id) => {
        const updates: any = {};
        if (entry.lenderID === user.uid) updates.hiddenByLender = true;
        if (entry.borrowerEmail === user.email) updates.hiddenByBorrower = true;
        batch.update(doc(db, 'borrowEntries', id), updates);
      });
      await batch.commit();
      toast.success("Your inventory has been cleared");
    } catch (error) {
      console.error("Clear inventory error:", error);
      toast.error("Failed to clear inventory");
    }
  };

  const handleAskBack = async (entry: BorrowEntry, tone: string) => {
    const messages: Record<string, string> = {
      friendly: `Hey 👋 just a friendly reminder about the ${entry.itemName}!`,
      casual: `Yo, any update on the ${entry.itemName}? 🙂`,
      strict: `Hi, I need the ${entry.itemName} back as soon as possible. 😐`
    };

    const message = messages[tone];
    toast.info(`Reminder sent: "${message}"`);
    
    // Send email notification via backend
    sendEmailNotification(
      entry.borrowerEmail,
      `BorrowBack Reminder: ${entry.itemName}`,
      message
    );
    
    await updateDoc(doc(db, 'borrowEntries', entry.id), {
      lastReminderSentAt: serverTimestamp(),
      lastReminderTone: tone,
      reminderCount: (entry as any).reminderCount ? (entry as any).reminderCount + 1 : 1
    });
  };

  const filteredEntries = useMemo(() => {
    return entries.filter(entry => 
      entry.itemName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.lenderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.borrowerEmail.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => {
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return dateB - dateA;
    });
  }, [entries, searchQuery]);

  const givenEntries = filteredEntries.filter(e => e.lenderID === user?.uid);
  const takenEntries = filteredEntries.filter(e => e.borrowerEmail === user?.email);

  const lenderIntegrity = useMemo(() => {
    const myLentItems = entries.filter(e => e.lenderID === user?.uid);
    if (myLentItems.length === 0) return 100;
    const returnedItems = myLentItems.filter(e => e.status === 'RETURNED').length;
    return Math.round((returnedItems / myLentItems.length) * 100);
  }, [entries, user]);

  const activeLoansCount = useMemo(() => {
    return entries.filter(e => 
      e.status !== 'RETURNED' && 
      e.status !== 'CANCELLED' && 
      (e.lenderID === user?.uid || e.borrowerEmail === user?.email)
    ).length;
  }, [entries, user]);

  const userBadge = useMemo(() => {
    const myBorrowedItems = entries.filter(e => e.borrowerEmail === user?.email);
    const returnedOnTime = myBorrowedItems.filter(e => {
      if (e.status !== 'RETURNED') return false;
      return true;
    }).length;

    if (returnedOnTime > 5) return { label: "On-time King 👑", color: "text-yellow-500" };
    if (myBorrowedItems.filter(e => e.status === 'ACTIVE' && e.returnDate && isAfter(new Date(), e.returnDate.toDate())).length > 3) 
      return { label: "Late Legend 😂", color: "text-orange-500" };
    return null;
  }, [entries, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full mb-6"
        />
        <h2 className="text-3xl font-serif italic text-accent animate-pulse">BorrowBack</h2>
        <p className="text-ink-dim mt-2 tracking-widest uppercase text-[10px]">Securing your belongings</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-bg p-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full space-y-8"
        >
          <div className="space-y-2">
            <div className="w-20 h-20 bg-accent rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-accent/20">
              <ArrowUpRight className="text-bg w-10 h-10" />
            </div>
            <h1 className="text-4xl font-serif italic tracking-tight text-accent">BorrowBack</h1>
            <p className="text-ink-dim text-lg">Sophisticated accountability for your belongings.</p>
          </div>
          <Button 
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="w-full h-14 text-lg font-semibold rounded-2xl bg-accent text-bg hover:bg-accent/90 shadow-lg hover:shadow-xl transition-all border-none relative overflow-hidden"
          >
            {isLoggingIn ? (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-6 h-6 border-2 border-bg border-t-transparent rounded-full mx-auto"
              />
            ) : (
              <div className="flex items-center justify-center gap-3">
                <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                Sign in with Google
              </div>
            )}
          </Button>
          <p className="text-xs text-ink-dim uppercase tracking-widest font-medium">
            Secure • Real-time • Elegant
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-ink font-sans flex flex-col lg:flex-row">
      <CustomCursor />
      <Toaster position="top-center" theme="dark" />
      
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex w-80 flex-col p-10 border-r border-surface-alt h-screen sticky top-0 overflow-y-auto custom-scrollbar">
        <SidebarContent 
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          friendSearchQuery={friendSearchQuery}
          setFriendSearchQuery={setFriendSearchQuery}
          lenderIntegrity={lenderIntegrity}
          user={user}
          userBadge={userBadge}
          activeLoansCount={activeLoansCount}
          isAddFriendDialogOpen={isAddFriendDialogOpen}
          setIsAddFriendDialogOpen={setIsAddFriendDialogOpen}
          friendName={friendName}
          setFriendName={setFriendName}
          friendEmail={friendEmail}
          setFriendEmail={setFriendEmail}
          handleAddFriend={handleAddFriend}
          friends={friends}
          friendRequests={friendRequests}
          handleAcceptFriendRequest={handleAcceptFriendRequest}
          handleRejectFriendRequest={handleRejectFriendRequest}
          onOpenClearInventory={() => setIsClearInventoryOpen(true)}
          handleLogout={handleLogout}
        />
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden sticky top-0 z-10 bg-bg/80 backdrop-blur-md border-b border-surface-alt px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Dialog open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <DialogTrigger render={
              <Button variant="ghost" size="icon" className="text-accent rounded-full hover:bg-accent/10">
                <Users className="w-6 h-6" />
              </Button>
            } />
            <DialogContent className="bg-bg border-none text-ink p-8 h-[90vh] w-[90vw] max-w-sm rounded-3xl overflow-y-auto">
              <SidebarContent 
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                friendSearchQuery={friendSearchQuery}
                setFriendSearchQuery={setFriendSearchQuery}
                lenderIntegrity={lenderIntegrity}
                user={user}
                userBadge={userBadge}
                activeLoansCount={activeLoansCount}
                isAddFriendDialogOpen={isAddFriendDialogOpen}
                setIsAddFriendDialogOpen={setIsAddFriendDialogOpen}
                friendName={friendName}
                setFriendName={setFriendName}
                friendEmail={friendEmail}
                setFriendEmail={setFriendEmail}
                handleAddFriend={handleAddFriend}
                friends={friends}
                friendRequests={friendRequests}
                handleAcceptFriendRequest={handleAcceptFriendRequest}
                handleRejectFriendRequest={handleRejectFriendRequest}
                onOpenClearInventory={() => {
                  setIsMobileMenuOpen(false);
                  setIsClearInventoryOpen(true);
                }}
                handleLogout={handleLogout}
              />
            </DialogContent>
          </Dialog>
          <h1 className="font-serif italic text-2xl text-accent">BorrowBack</h1>
        </div>
        <div className="flex items-center gap-3">
          <Avatar className="w-8 h-8 border border-accent rounded-full">
            <AvatarImage src={user?.photoURL || undefined} className="rounded-full" />
            <AvatarFallback className="rounded-full bg-surface-alt text-accent">{user?.name?.[0] || '?'}</AvatarFallback>
          </Avatar>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 lg:p-10 max-w-5xl mx-auto w-full">
        <div className="flex justify-between items-end mb-10">
          <div className="title-area">
            <h1 className="text-5xl font-light tracking-tighter">Inventory</h1>
          </div>
          <div className="text-ink-dim text-sm hidden sm:block">
            {format(new Date(), "MMM d, yyyy")}
          </div>
        </div>

        <Tabs defaultValue="given" className="w-full">
          <TabsList className="w-full flex items-center justify-center rounded-full bg-gray-800/60 backdrop-blur-md p-1 mb-10 border-none">
            <TabsTrigger 
              value="given" 
              className="flex-1 inline-flex items-center justify-center whitespace-nowrap rounded-full py-2.5 text-sm transition-all duration-200 text-gray-400 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:font-semibold data-[state=active]:shadow-md"
            >
              Given (Lent)
              {givenEntries.filter(e => e.status === 'RETURN_REQUESTED' && e.returnRequestedBy !== user.uid).length > 0 && (
                <span className="ml-2 w-2 h-2 bg-accent rounded-full animate-pulse" />
              )}
            </TabsTrigger>
            <TabsTrigger 
              value="taken" 
              className="flex-1 inline-flex items-center justify-center whitespace-nowrap rounded-full py-2.5 text-sm transition-all duration-200 text-gray-400 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:font-semibold data-[state=active]:shadow-md"
            >
              Taken (Borrowed)
              {takenEntries.filter(e => e.status === 'REQUESTED').length > 0 && (
                <span className="ml-2 w-2 h-2 bg-accent rounded-full animate-pulse" />
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="given" className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <AnimatePresence mode="popLayout">
              {givenEntries.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="col-span-full py-32 flex flex-col items-center justify-center text-center space-y-4"
                >
                  <div className="w-16 h-16 bg-surface-alt rounded-full flex items-center justify-center text-accent/40">
                    <ArrowUpRight className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-medium text-ink">Nothing lent yet</h3>
                    <p className="text-sm text-ink-dim max-w-xs mx-auto">
                      Start tracking your items by clicking the plus button below.
                    </p>
                  </div>
                </motion.div>
              ) : (
                givenEntries.map(entry => (
                  <EntryCard 
                    key={entry.id} 
                    entry={entry} 
                    isLender={true} 
                    onUpdateStatus={updateEntryStatus}
                    onAskBack={(tone) => handleAskBack(entry, tone)}
                    currentUserId={user.uid}
                    friends={friends}
                  />
                ))
              )}
            </AnimatePresence>
          </TabsContent>

          <TabsContent value="taken" className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <AnimatePresence mode="popLayout">
              {takenEntries.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="col-span-full py-32 flex flex-col items-center justify-center text-center space-y-4"
                >
                  <div className="w-16 h-16 bg-surface-alt rounded-full flex items-center justify-center text-accent/40">
                    <Users className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-medium text-ink">Nothing borrowed yet</h3>
                    <p className="text-sm text-ink-dim max-w-xs mx-auto">
                      Items shared with you will appear here automatically.
                    </p>
                  </div>
                </motion.div>
              ) : (
                takenEntries.map(entry => (
                  <EntryCard 
                    key={entry.id} 
                    entry={entry} 
                    isLender={false} 
                    onUpdateStatus={updateEntryStatus}
                    onAskBack={() => {}}
                    currentUserId={user.uid}
                    friends={friends}
                  />
                ))
              )}
            </AnimatePresence>
          </TabsContent>
        </Tabs>
      </main>

      {/* FAB */}
      <Dialog open={isLendDialogOpen} onOpenChange={setIsLendDialogOpen}>
        <DialogTrigger render={
          <Button className="fixed bottom-10 right-10 h-16 w-16 rounded-full bg-accent text-bg shadow-2xl shadow-accent/30 hover:scale-105 transition-transform text-3xl font-light border-none">
            +
          </Button>
        } />
        <DialogContent className="bg-surface border-surface-alt text-ink rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-serif italic text-accent">Lend Item</DialogTitle>
            <DialogDescription className="text-ink-dim">
              Sophisticated tracking for your belongings.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleLendItem} className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-ink-dim">Item Name</Label>
              <Input 
                placeholder="e.g. MacBook Pro Charger" 
                className="bg-surface-alt border-none h-12 rounded-xl focus-visible:ring-accent"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-widest text-ink-dim">Borrower</Label>
                {friends.filter(f => f.status === 'ACCEPTED').length > 0 && (
                  <Popover open={isSelectFriendOpen} onOpenChange={setIsSelectFriendOpen}>
                    <PopoverTrigger render={
                      <Button variant="link" size="sm" className="h-auto p-0 text-[10px] text-accent uppercase tracking-wider">
                        Select Friend
                      </Button>
                    } />
                    <PopoverContent className="w-64 p-3 bg-gray-900 border-gray-800 rounded-xl shadow-lg">
                      <div className="space-y-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <Input 
                            placeholder="Search friends..." 
                            className="bg-gray-800 border-none h-10 rounded-xl pl-9 pr-4 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus-visible:ring-1 focus-visible:ring-accent"
                            value={dropdownSearchQuery}
                            onChange={(e) => setDropdownSearchQuery(e.target.value)}
                          />
                        </div>
                        <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                          {friends.filter(f => f.status === 'ACCEPTED').length === 0 ? (
                            <div className="text-xs text-gray-500 italic px-2 py-2">No friends added yet.</div>
                          ) : friends.filter(f => f.status === 'ACCEPTED' && (f?.name?.toLowerCase().includes(dropdownSearchQuery.toLowerCase()) || f?.email?.toLowerCase().includes(dropdownSearchQuery.toLowerCase()))).length === 0 ? (
                            <div className="text-xs text-gray-500 italic px-2 py-2">No friends found.</div>
                          ) : (
                            friends
                              .filter(f => f.status === 'ACCEPTED' && (f?.name?.toLowerCase().includes(dropdownSearchQuery.toLowerCase()) || f?.email?.toLowerCase().includes(dropdownSearchQuery.toLowerCase())))
                              .map(f => (
                                <div 
                                  key={f.id} 
                                  className="w-full flex flex-col justify-start text-left px-4 py-2 rounded-lg hover:bg-gray-700 cursor-pointer transition-colors"
                                  onClick={() => {
                                    setNewBorrowerEmail(f.email);
                                    setNewBorrowerName(f.name);
                                    setIsSelectFriendOpen(false);
                                  }}
                                >
                                  <span className="text-sm font-medium text-gray-100">{f.name}</span>
                                  {f.email && <span className="text-[10px] text-gray-400">{f.email}</span>}
                                </div>
                              ))
                          )}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input 
                  placeholder="Name (Optional)" 
                  className="bg-surface-alt border-none h-12 rounded-xl focus-visible:ring-accent"
                  value={newBorrowerName}
                  onChange={(e) => setNewBorrowerName(e.target.value)}
                />
                <Input 
                  type="email" 
                  placeholder="Email" 
                  className="bg-surface-alt border-none h-12 rounded-xl focus-visible:ring-accent"
                  value={newBorrowerEmail}
                  onChange={(e) => setNewBorrowerEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-surface-alt rounded-2xl">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Monetary Value</Label>
                <div className="text-xs text-ink-dim">Track partial returns for money</div>
              </div>
              <input 
                type="checkbox" 
                checked={isMonetary} 
                onChange={(e) => setIsMonetary(e.target.checked)}
                className="w-5 h-5 accent-accent rounded-md"
              />
            </div>

            {isMonetary && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                <Label className="text-xs uppercase tracking-widest text-ink-dim">Total Amount (₹)</Label>
                <Input 
                  type="number"
                  placeholder="1000" 
                  className="bg-surface-alt border-none h-12 rounded-xl focus-visible:ring-accent"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-ink-dim">Return Date</Label>
              <Popover>
                <PopoverTrigger render={
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full h-12 justify-start text-left font-normal bg-surface-alt border-none rounded-xl",
                      !newReturnDate && "text-ink-dim"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newReturnDate ? format(newReturnDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                } />
                <PopoverContent className="w-auto p-0 bg-surface border-surface-alt rounded-2xl shadow-2xl" align="start">
                  <Calendar
                    mode="single"
                    selected={newReturnDate}
                    onSelect={setNewReturnDate}
                    initialFocus
                    className="bg-surface text-ink"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-ink-dim">Notes (Optional)</Label>
              <Input 
                placeholder="e.g. Please handle with care" 
                className="bg-surface-alt border-none h-12 rounded-xl focus-visible:ring-accent"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button type="submit" className="w-full h-14 bg-accent text-bg hover:bg-accent/90 rounded-full font-semibold border-none active:scale-95 transition-all" disabled={isSubmitting}>
                {isSubmitting ? "Processing..." : "Confirm Loan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Clear Inventory Dialog (Root Level) */}
      <Dialog open={isClearInventoryOpen} onOpenChange={setIsClearInventoryOpen}>
        <DialogContent className="bg-surface border-surface-alt text-ink rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-serif italic text-status-overdue">Clear All Data?</DialogTitle>
            <DialogDescription className="text-ink-dim">
              This will permanently delete all your lending and borrowing records. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-3 sm:justify-start">
            <Button variant="ghost" className="rounded-full" onClick={() => setIsClearInventoryOpen(false)}>Cancel</Button>
            <Button 
              className="bg-status-overdue text-bg hover:bg-status-overdue/90 rounded-full px-8"
              onClick={() => {
                clearInventory();
                setIsClearInventoryOpen(false);
              }}
            >
              Yes, Clear All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface SidebarContentProps {
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  friendSearchQuery: string;
  setFriendSearchQuery: (val: string) => void;
  lenderIntegrity: number;
  user: UserProfile | null;
  userBadge: { label: string, color: string } | null;
  activeLoansCount: number;
  isAddFriendDialogOpen: boolean;
  setIsAddFriendDialogOpen: (val: boolean) => void;
  friendName: string;
  setFriendName: (val: string) => void;
  friendEmail: string;
  setFriendEmail: (val: string) => void;
  handleAddFriend: (e: React.FormEvent) => Promise<void>;
  friends: Friend[];
  friendRequests: Friend[];
  handleAcceptFriendRequest: (request: Friend) => Promise<void>;
  handleRejectFriendRequest: (requestId: string) => Promise<void>;
  onOpenClearInventory: () => void;
  handleLogout: () => Promise<void>;
}

const SidebarContent = ({
  searchQuery,
  setSearchQuery,
  friendSearchQuery,
  setFriendSearchQuery,
  lenderIntegrity,
  user,
  userBadge,
  activeLoansCount,
  isAddFriendDialogOpen,
  setIsAddFriendDialogOpen,
  friendName,
  setFriendName,
  friendEmail,
  setFriendEmail,
  handleAddFriend,
  friends,
  friendRequests,
  handleAcceptFriendRequest,
  handleRejectFriendRequest,
  onOpenClearInventory,
  handleLogout
}: SidebarContentProps) => {
  return (
    <div className="flex flex-col justify-between min-h-full">
    <div className="space-y-10">
      <div className="logo-section">
        <h1 className="font-serif italic text-3xl text-accent tracking-tighter">BorrowBack</h1>
        <div className="relative mt-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-dim w-4 h-4" />
          <Input 
            placeholder="Search entries..." 
            className="pl-10 h-12 bg-surface-alt border-none rounded-xl text-ink placeholder:text-ink-dim focus-visible:ring-1 focus-visible:ring-accent"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="stats-group space-y-8">
        <div className="trust-score">
          <div className="text-[11px] uppercase tracking-[2px] text-ink-dim mb-1">Lender Integrity</div>
          <div className="text-3xl font-semibold text-accent">{lenderIntegrity}%</div>
        </div>

        <div className="profile-card bg-surface p-6 rounded-3xl border border-surface-alt space-y-4 shadow-sm shadow-black/5">
          <div className="flex items-center gap-3">
            <Avatar className="w-11 h-11 border border-accent rounded-full">
              <AvatarImage src={user?.photoURL} className="rounded-full" />
              <AvatarFallback className="bg-surface-alt text-accent rounded-full">{user?.name[0]}</AvatarFallback>
            </Avatar>
            <div className="overflow-hidden">
              <div className="font-semibold truncate flex items-center gap-2">
                {user?.name}
                {userBadge && <Trophy className={cn("w-3 h-3", userBadge.color)} />}
              </div>
              <div className="text-xs text-ink-dim truncate">{user?.email}</div>
            </div>
          </div>
          {userBadge && (
            <div className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-surface-alt inline-block", userBadge.color)}>
              {userBadge.label}
            </div>
          )}
          <div>
            <div className="text-[11px] uppercase tracking-[1px] text-ink-dim mb-1">Active Loans</div>
            <div className="text-xl font-semibold text-accent">{activeLoansCount} Items</div>
          </div>
        </div>

        <div className="friends-section space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-[2px] text-ink-dim">Friends</div>
            <Dialog open={isAddFriendDialogOpen} onOpenChange={setIsAddFriendDialogOpen}>
              <DialogTrigger render={
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-accent/10 hover:text-accent">
                  <UserPlus className="w-4 h-4" />
                </Button>
              } />
              <DialogContent className="bg-surface border-surface-alt text-ink rounded-3xl">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-serif italic text-accent">Add Friend</DialogTitle>
                  <DialogDescription className="text-ink-dim">Save friends for quicker lending.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddFriend} className="space-y-6 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="friend-name" className="text-xs uppercase tracking-widest text-ink-dim">Name</Label>
                    <Input 
                      id="friend-name"
                      name="friend-name"
                      placeholder="Friend's Name" 
                      className="bg-surface-alt border-none h-12 rounded-xl focus-visible:ring-accent"
                      value={friendName}
                      onChange={(e) => setFriendName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="friend-email" className="text-xs uppercase tracking-widest text-ink-dim">Email</Label>
                    <Input 
                      id="friend-email"
                      name="friend-email"
                      type="email"
                      placeholder="friend@example.com" 
                      className="bg-surface-alt border-none h-12 rounded-xl focus-visible:ring-accent"
                      value={friendEmail}
                      onChange={(e) => setFriendEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full h-14 bg-accent text-bg hover:bg-accent/90 rounded-full font-semibold border-none active:scale-95 transition-all">
                    Save Friend
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          
          {friends.length > 5 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim w-3 h-3" />
              <Input 
                placeholder="Search friends..." 
                className="pl-8 h-8 bg-surface-alt border-none rounded-lg text-xs text-ink placeholder:text-ink-dim focus-visible:ring-1 focus-visible:ring-accent"
                value={friendSearchQuery}
                onChange={(e) => setFriendSearchQuery(e.target.value)}
              />
            </div>
          )}

          {friendRequests.length > 0 && (
            <div className="space-y-2 mb-4">
              <div className="text-[11px] uppercase tracking-[2px] text-accent font-semibold">Friend Requests ({friendRequests.length})</div>
              {friendRequests.map(request => (
                <div key={request.id} className="flex flex-col gap-2 p-3 bg-accent/5 border border-accent/20 rounded-xl">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-accent/20 rounded-full flex items-center justify-center text-[10px] text-accent font-bold">
                      {request.requesterName?.[0] || request.requesterEmail?.[0] || '?'}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{request.requesterName || 'Someone'}</span>
                      <span className="text-[10px] text-ink-dim">{request.requesterEmail}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <Button size="sm" className="h-7 flex-1 bg-accent text-bg rounded-lg text-xs" onClick={() => handleAcceptFriendRequest(request)}>
                      Accept
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 flex-1 text-ink-dim hover:text-red-500 hover:bg-red-500/10 rounded-lg text-xs" onClick={() => handleRejectFriendRequest(request.id)}>
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
            {friends.length === 0 ? (
              <div className="text-xs text-ink-dim italic">No friends added yet.</div>
            ) : (
              friends
                .filter(f => f.name.toLowerCase().includes(friendSearchQuery.toLowerCase()) || f.email.toLowerCase().includes(friendSearchQuery.toLowerCase()))
                .map(friend => (
                <div key={friend.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-alt transition-colors group">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-accent/10 rounded-full flex items-center justify-center text-[10px] text-accent font-bold">
                      {friend.name[0]}
                    </div>
                    <div className="flex flex-col">
                      <div className="text-sm font-medium flex items-center gap-2">
                        {friend.name}
                        {friend.status === 'PENDING' && (
                          <span className="text-[8px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-full uppercase tracking-wider">Pending</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-accent">
                    <Star className="w-3 h-3 fill-accent" />
                    {friend.trustScore?.toFixed(1) || "5.0"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-8">
        <Button variant="ghost" className="justify-start text-ink-dim hover:text-red-500 hover:bg-red-500/10 rounded-xl" onClick={onOpenClearInventory}>
          <Trash2 className="w-5 h-5 mr-2" />
          Clear Inventory
        </Button>

        <Button variant="ghost" className="justify-start text-ink-dim hover:text-red-500 hover:bg-red-500/10 rounded-xl" onClick={handleLogout}>
          <LogOut className="w-5 h-5 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  </div>
  );
};

interface EntryCardProps {
  entry: BorrowEntry;
  isLender: boolean;
  onUpdateStatus: (id: string, status: EntryStatus, extra?: any) => Promise<void>;
  onAskBack: (tone: string) => Promise<void> | void;
  currentUserId: string;
  friends?: Friend[];
  key?: string;
}

function EntryCard({ 
  entry, 
  isLender, 
  onUpdateStatus, 
  onAskBack,
  currentUserId,
  friends = []
}: EntryCardProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [partialAmount, setPartialAmount] = useState('');
  const [replyText, setReplyText] = useState('');

  if (!entry) return null;

  const friend = friends.find(f => f.email === entry.borrowerEmail);
  const trustScore = friend?.trustScore;

  const returnDate = entry.returnDate?.toDate?.() || null;
  const createdAt = entry.createdAt?.toDate?.() || null;
  const isOverdue = returnDate && isAfter(new Date(), returnDate) && entry.status === 'ACTIVE';
  const daysDiff = returnDate ? Math.abs(differenceInDays(new Date(), returnDate)) : null;
  
  const statusConfig = {
    REQUESTED: { color: 'text-status-pending bg-status-pending/10 border-status-pending/20', label: 'Pending' },
    ACTIVE: { color: isOverdue ? 'text-status-overdue bg-status-overdue/10 border-status-overdue/20' : 'text-status-pending bg-status-pending/10 border-status-pending/20', label: isOverdue ? 'Overdue' : 'Active' },
    RETURN_REQUESTED: { color: 'text-accent bg-accent/10 border-accent/20', label: 'Returning' },
    RETURNED: { color: 'text-status-returned bg-status-returned/10 border-status-returned/20', label: 'Returned' },
    CANCELLED: { color: 'text-ink-dim bg-surface-alt border-surface-alt', label: 'Cancelled' },
  };

  const config = statusConfig[entry.status] || statusConfig.REQUESTED;

  const countdownColor = isOverdue 
    ? "text-status-overdue" 
    : (daysDiff !== null && daysDiff <= 2) 
      ? "text-orange-500" 
      : "text-ink-dim";

  const handleAddPartial = async () => {
    const amount = parseFloat(partialAmount);
    if (isNaN(amount) || amount <= 0) return;
    
    const newReturned = (entry.returnedAmount || 0) + amount;
    const isFullyReturned = newReturned >= (entry.totalAmount || 0);
    
    // If lender is adding payment and it's full, mark as RETURNED
    // If borrower was adding (not currently possible in UI but for safety), mark as RETURN_REQUESTED
    const nextStatus = isFullyReturned ? (isLender ? 'RETURNED' : 'RETURN_REQUESTED') : 'ACTIVE';
    
    await onUpdateStatus(entry.id, nextStatus, { 
      returnedAmount: newReturned,
      ...(isFullyReturned && !isLender ? { returnRequestedBy: currentUserId } : {})
    });
    setPartialAmount('');
  };

  const handleReply = async () => {
    if (!replyText.trim()) return;
    await onUpdateStatus(entry.id, entry.status, { borrowerReply: replyText.trim() });
    setReplyText('');
  };

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        whileHover={{ scale: 1.01, y: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsDetailOpen(true)}
        className="cursor-pointer"
      >
        <Card className="bg-surface border-surface-alt rounded-3xl p-6 h-auto min-h-[220px] flex flex-col justify-between shadow-sm shadow-black/5 hover:border-accent/30 transition-all duration-200 group relative overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <div className="space-y-1">
              <h3 className="text-xl font-medium text-ink flex items-center gap-2">
                {entry.itemName || 'Unnamed Item'}
                {entry.isMonetary && <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">₹</span>}
              </h3>
              <p className="text-sm text-ink-dim flex items-center gap-2">
                {isLender ? `to ${entry.borrowerName || entry.borrowerEmail}` : `from ${entry.lenderName}`}
                {isLender && trustScore !== undefined && (
                  <span className="flex items-center gap-0.5 text-[10px] text-accent font-bold">
                    <Star className="w-2.5 h-2.5 fill-accent" />
                    {trustScore.toFixed(1)}
                  </span>
                )}
              </p>
            </div>
            <Badge className={cn("text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border", config.color)}>
              {config.label}
            </Badge>
          </div>

          {entry.isMonetary && entry.totalAmount && (
            <div className="mb-4 p-3 bg-surface-alt rounded-2xl space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-ink-dim">Repayment Progress</span>
                <span className="text-accent font-bold">₹{entry.returnedAmount || 0} / ₹{entry.totalAmount}</span>
              </div>
              <div className="w-full h-1.5 bg-bg rounded-full overflow-hidden">
                <div 
                  className="h-full bg-accent transition-all duration-500" 
                  style={{ width: `${entry.totalAmount && entry.totalAmount > 0 ? Math.min(100, ((entry.returnedAmount || 0) / entry.totalAmount) * 100) : 0}%` }}
                />
              </div>
            </div>
          )}
          
          <div className="flex justify-between items-end">
            <div className="space-y-1">
              <div className={cn("text-xs font-medium flex items-center gap-1", countdownColor)}>
                {entry.status === 'RETURNED' ? (
                  <span className="flex items-center gap-1 text-status-returned"><CheckCircle2 className="w-3 h-3" /> Verified</span>
                ) : (
                  <>
                    {returnDate ? (
                      <>
                        <CalendarIcon className="w-3 h-3" />
                        {isOverdue ? `Overdue by ${daysDiff}d` : `Due in ${daysDiff}d`}
                      </>
                    ) : (
                      createdAt ? `Lent ${formatDistanceToNow(createdAt, { addSuffix: true })}` : 'Just now'
                    )}
                  </>
                )}
              </div>
              {entry.notes && <div className="text-[10px] text-ink-dim italic truncate max-w-[150px]">"{entry.notes}"</div>}
            </div>

            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              {/* Quick Actions */}
              {isLender && entry.status === 'ACTIVE' && (
                <Popover>
                  <PopoverTrigger render={
                    <Button 
  size="sm"
  className={cn(
    "rounded-full text-xs px-5 py-2 font-medium transition-all duration-300 active:scale-95",
    
    isOverdue
      ? "bg-status-overdue/90 text-white border border-status-overdue shadow-[0_0_12px_rgba(255,80,80,0.6)] hover:shadow-[0_0_18px_rgba(255,80,80,0.9)]"
      : "bg-white/10 backdrop-blur-md text-white border border-white/20 shadow-[0_0_10px_rgba(255,255,255,0.15)] hover:bg-white/20 hover:shadow-[0_0_16px_rgba(255,255,255,0.35)]"
  )}
>
  {isOverdue ? "Urgent Ping" : "Ask Back"}
</Button>
                  } />
                  <PopoverContent className="w-48 p-2 bg-surface border-surface-alt rounded-2xl shadow-2xl">
                    <div className="text-[10px] uppercase tracking-wider text-ink-dim px-2 mb-2">Select Tone</div>
                    <div className="grid grid-cols-1 gap-1">
                      <Button
  size="sm"
  className="justify-start rounded-xl h-9 text-xs 
             bg-gray-800 text-gray-200 
             hover:bg-gray-700 active:scale-95 transition-all"
  onClick={() => onAskBack('friendly')}
>
  Friendly 😄
</Button>
                      <Button
  size="sm"
  className="justify-start rounded-xl h-9 text-xs 
             bg-gray-800 text-gray-200 
             hover:bg-gray-700 active:scale-95 transition-all"
  onClick={() => onAskBack('casual')}
>
  Casual 🙂
</Button>
                      <Button
  size="sm"
  className="justify-start rounded-xl h-9 text-xs 
             bg-gray-800 text-gray-200 
             hover:bg-gray-700 active:scale-95 transition-all"
  onClick={() => onAskBack('strict')}
>
  Strict 😐
</Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        </Card>
      </motion.div>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="bg-surface border-surface-alt text-ink rounded-3xl max-w-md">
          <DialogHeader className="pr-10">
            <div className="flex justify-between items-start mb-2">
              <Badge className={cn("text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border", config.color)}>
                {config.label}
              </Badge>
              <div className="text-xs text-ink-dim">
                {createdAt && `Lent ${format(createdAt, "PPP")}`}
              </div>
            </div>
            <DialogTitle className="text-3xl font-serif italic text-accent">{entry.itemName}</DialogTitle>
            <DialogDescription className="text-ink-dim">
              {isLender ? `Lent to ${entry.borrowerName || entry.borrowerEmail}` : `Borrowed from ${entry.lenderName}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-6">
            {entry.isMonetary && entry.totalAmount && (
              <div className="p-5 bg-surface-alt rounded-3xl space-y-4">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-widest text-ink-dim">Repayment Status</div>
                    <div className="text-2xl font-semibold text-accent">₹{entry.returnedAmount || 0} <span className="text-sm text-ink-dim font-normal">of ₹{entry.totalAmount}</span></div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-ink-dim">Remaining</div>
                    <div className="text-lg font-medium text-ink">₹{(entry.totalAmount || 0) - (entry.returnedAmount || 0)}</div>
                  </div>
                </div>
                <div className="w-full h-2 bg-bg rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-accent transition-all duration-500" 
                    style={{ width: `${entry.totalAmount && entry.totalAmount > 0 ? Math.min(100, ((entry.returnedAmount || 0) / entry.totalAmount) * 100) : 0}%` }}
                  />
                </div>

                {isLender && entry.status === 'ACTIVE' && (entry.returnedAmount || 0) < entry.totalAmount && (
                  <div className="flex gap-2 pt-2">
                    <Input 
                      type="number" 
                      placeholder="Amount" 
                      className="bg-bg border-none h-10 rounded-xl text-sm"
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                    />
                    <Button size="sm" className="bg-accent text-bg rounded-xl px-4" onClick={handleAddPartial}>
                      Add Payment
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-surface-alt rounded-2xl space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-ink-dim">Due Date</div>
                <div className={cn("text-sm font-medium", countdownColor)}>
                  {returnDate ? format(returnDate, "MMM d, yyyy") : "No due date"}
                </div>
              </div>
              <div className="p-4 bg-surface-alt rounded-2xl space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-ink-dim">Friend Trust</div>
                <div className="text-sm font-medium flex items-center gap-1">
                  <Star className="w-3 h-3 fill-accent text-accent" />
                  {trustScore?.toFixed(1) || "5.0"}
                </div>
              </div>
            </div>

            {entry.notes && (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-widest text-ink-dim">Notes</Label>
                <div className="p-4 bg-surface-alt rounded-2xl text-sm italic text-ink-dim">
                  "{entry.notes}"
                </div>
                
                {entry.borrowerReply ? (
                  <div className="mt-2 pl-4 border-l-2 border-accent/30 space-y-1">
                    <Label className="text-[10px] uppercase tracking-widest text-accent">Reply</Label>
                    <div className="text-sm text-ink-dim">
                      "{entry.borrowerReply}"
                    </div>
                  </div>
                ) : !isLender ? (
                  <div className="mt-2 flex gap-2">
                    <Input 
                      placeholder="Reply to note (once only)..." 
                      className="bg-surface-alt border-none h-10 rounded-xl text-sm"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                    />
                    <Button size="sm" className="bg-accent text-bg rounded-xl px-4" onClick={handleReply} disabled={!replyText.trim()}>
                      Reply
                    </Button>
                  </div>
                ) : null}
              </div>
            )}

            <div className="flex flex-col gap-3 pt-4">
              {!isLender && entry.status === 'REQUESTED' && (
                <div className="grid grid-cols-2 gap-3">
                  <Button onClick={() => onUpdateStatus(entry.id, 'ACTIVE', { borrowerID: currentUserId })} className="bg-accent text-bg rounded-full h-12 font-semibold">
                    Accept Request
                  </Button>
                  <Button variant="ghost" onClick={() => onUpdateStatus(entry.id, 'CANCELLED')} className="text-ink-dim rounded-full h-12">
                    Reject
                  </Button>
                </div>
              )}

              {entry.status === 'ACTIVE' && (
                <Button 
                  onClick={() => onUpdateStatus(entry.id, isLender ? 'RETURNED' : 'RETURN_REQUESTED', { returnRequestedBy: currentUserId })}
                  className="bg-accent text-bg rounded-full h-14 font-semibold text-lg"
                >
                  {isLender ? "Mark as Returned" : "I've Returned This"}
                </Button>
              )}

              {entry.status === 'RETURN_REQUESTED' && isLender && (
                <Button 
                  onClick={() => onUpdateStatus(entry.id, 'RETURNED')}
                  className="bg-status-returned text-bg rounded-full h-14 font-semibold text-lg"
                >
                  Confirm Receipt
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

