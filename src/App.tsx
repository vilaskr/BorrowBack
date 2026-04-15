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
  query,
  where,
  onSnapshot,
  serverTimestamp,
  addDoc,
  updateDoc,
  Timestamp
} from './firebase';
import { UserProfile, BorrowEntry, EntryStatus } from './types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Toaster, toast } from 'sonner';
import { Plus, LogOut, Search, ArrowUpRight, Calendar as CalendarIcon } from 'lucide-react';
import { format, formatDistanceToNow, isAfter } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<BorrowEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLendDialogOpen, setIsLendDialogOpen] = useState(false);

  // Form state for new entry
  const [newItemName, setNewItemName] = useState('');
  const [newBorrowerEmail, setNewBorrowerEmail] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newReturnDate, setNewReturnDate] = useState<Date | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      const lenderEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BorrowEntry));
      setEntries(prev => {
        const otherEntries = prev.filter(e => e.lenderID !== user.uid);
        return [...otherEntries, ...lenderEntries];
      });
    });

    // Listen for entries where user is borrower (by email)
    const qBorrower = query(collection(db, 'borrowEntries'), where('borrowerEmail', '==', user.email));
    const unsubscribeBorrower = onSnapshot(qBorrower, (snapshot) => {
      const borrowerEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BorrowEntry));
      setEntries(prev => {
        const otherEntries = prev.filter(e => e.borrowerEmail !== user.email);
        return [...otherEntries, ...borrowerEntries];
      });
    });

    return () => {
      unsubscribeLender();
      unsubscribeBorrower();
    };
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      toast.success('Logged in successfully');
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Failed to login');
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

  const handleLendItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newItemName || !newBorrowerEmail) return;

    setIsSubmitting(true);
    try {
      const newEntry: Omit<BorrowEntry, 'id'> = {
        itemName: newItemName,
        lenderID: user.uid,
        lenderEmail: user.email,
        lenderName: user.name,
        borrowerEmail: newBorrowerEmail.toLowerCase().trim(),
        status: 'REQUESTED',
        createdAt: serverTimestamp(),
        notes: newNotes,
        returnDate: newReturnDate ? Timestamp.fromDate(newReturnDate) : null,
      };

      await addDoc(collection(db, 'borrowEntries'), newEntry);
      toast.success('Lend request sent!');
      setIsLendDialogOpen(false);
      setNewItemName('');
      setNewBorrowerEmail('');
      setNewNotes('');
      setNewReturnDate(undefined);
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
      toast.success(`Status updated to ${newStatus.toLowerCase().replace('_', ' ')}`);
    } catch (error) {
      console.error('Update error:', error);
      toast.error('Failed to update status');
    }
  };

  const handleAskBack = async (entry: BorrowEntry) => {
    toast.info(`Gentle reminder sent to ${entry.borrowerEmail}`);
    // In a real app, this would trigger a push notification via Cloud Functions
    // Here we just update a field to trigger a re-render or log
    await updateDoc(doc(db, 'borrowEntries', entry.id), {
      lastReminderSentAt: serverTimestamp()
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full"
        />
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
            className="w-full h-14 text-lg font-semibold rounded-2xl bg-accent text-bg hover:bg-accent/90 shadow-lg hover:shadow-xl transition-all border-none"
          >
            Sign in with Google
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
      <Toaster position="top-center" theme="dark" />
      
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex w-80 flex-col justify-between p-10 border-r border-surface-alt h-screen sticky top-0">
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
              <div className="text-3xl font-semibold text-accent">98.4</div>
            </div>

            <div className="profile-card bg-surface p-6 rounded-xl border border-surface-alt space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="w-11 h-11 border border-accent">
                  <AvatarImage src={user.photoURL} />
                  <AvatarFallback className="bg-surface-alt text-accent">{user.name[0]}</AvatarFallback>
                </Avatar>
                <div className="overflow-hidden">
                  <div className="font-semibold truncate">{user.name}</div>
                  <div className="text-xs text-ink-dim truncate">{user.email}</div>
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[1px] text-ink-dim mb-1">Active Loans</div>
                <div className="text-xl font-semibold text-accent">{entries.filter(e => e.status === 'ACTIVE').length} Items</div>
              </div>
            </div>
          </div>
        </div>

        <Button variant="ghost" className="justify-start text-ink-dim hover:text-red-500 hover:bg-red-500/10 rounded-xl" onClick={handleLogout}>
          <LogOut className="w-5 h-5 mr-2" />
          Sign Out
        </Button>
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden sticky top-0 z-10 bg-bg/80 backdrop-blur-md border-b border-surface-alt px-6 py-4 flex items-center justify-between">
        <h1 className="font-serif italic text-2xl text-accent">BorrowBack</h1>
        <div className="flex items-center gap-3">
          <Avatar className="w-8 h-8 border border-accent">
            <AvatarImage src={user.photoURL} />
            <AvatarFallback>{user.name[0]}</AvatarFallback>
          </Avatar>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-ink-dim">
            <LogOut className="w-5 h-5" />
          </Button>
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
          <TabsList className="flex gap-8 bg-transparent border-b border-surface-alt rounded-none h-auto p-0 mb-8 w-full justify-start">
            <TabsTrigger 
              value="given" 
              className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-accent px-0 pb-3 text-sm uppercase tracking-[2px] text-ink-dim data-[state=active]:text-ink transition-all"
            >
              Given (Lent)
              {givenEntries.filter(e => e.status === 'RETURN_REQUESTED' && e.returnRequestedBy !== user.uid).length > 0 && (
                <span className="ml-2 w-2 h-2 bg-accent rounded-full" />
              )}
            </TabsTrigger>
            <TabsTrigger 
              value="taken" 
              className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-accent px-0 pb-3 text-sm uppercase tracking-[2px] text-ink-dim data-[state=active]:text-ink transition-all"
            >
              Taken (Borrowed)
              {takenEntries.filter(e => e.status === 'REQUESTED').length > 0 && (
                <span className="ml-2 w-2 h-2 bg-accent rounded-full" />
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="given" className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <AnimatePresence mode="popLayout">
              {givenEntries.length === 0 ? (
                <div className="col-span-full py-20 text-center text-ink-dim">You haven't lent anything yet.</div>
              ) : (
                givenEntries.map(entry => (
                  <EntryCard 
                    key={entry.id} 
                    entry={entry} 
                    isLender={true} 
                    onUpdateStatus={updateEntryStatus}
                    onAskBack={() => handleAskBack(entry)}
                    currentUserId={user.uid}
                  />
                ))
              )}
            </AnimatePresence>
          </TabsContent>

          <TabsContent value="taken" className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <AnimatePresence mode="popLayout">
              {takenEntries.length === 0 ? (
                <div className="col-span-full py-20 text-center text-ink-dim">You haven't borrowed anything yet.</div>
              ) : (
                takenEntries.map(entry => (
                  <EntryCard 
                    key={entry.id} 
                    entry={entry} 
                    isLender={false} 
                    onUpdateStatus={updateEntryStatus}
                    onAskBack={() => {}}
                    currentUserId={user.uid}
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
        <DialogContent className="bg-surface border-surface-alt text-ink rounded-2xl">
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
              <Label className="text-xs uppercase tracking-widest text-ink-dim">Borrower Email</Label>
              <Input 
                type="email" 
                placeholder="friend@example.com" 
                className="bg-surface-alt border-none h-12 rounded-xl focus-visible:ring-accent"
                value={newBorrowerEmail}
                onChange={(e) => setNewBorrowerEmail(e.target.value)}
                required
              />
            </div>
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
                <PopoverContent className="w-auto p-0 bg-surface border-surface-alt rounded-xl shadow-2xl" align="start">
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
            <DialogFooter>
              <Button type="submit" className="w-full h-14 bg-accent text-bg hover:bg-accent/90 rounded-xl font-semibold border-none" disabled={isSubmitting}>
                {isSubmitting ? "Processing..." : "Confirm Loan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EntryCard({ 
  entry, 
  isLender, 
  onUpdateStatus, 
  onAskBack,
  currentUserId
}: { 
  entry: BorrowEntry, 
  isLender: boolean, 
  onUpdateStatus: (id: string, status: EntryStatus, extra?: any) => Promise<void>,
  onAskBack: () => Promise<void> | void,
  currentUserId: string,
  key?: string
}) {
  if (!entry) return null;

  const returnDate = entry.returnDate?.toDate?.() || null;
  const createdAt = entry.createdAt?.toDate?.() || null;
  const isOverdue = returnDate && isAfter(new Date(), returnDate) && entry.status === 'ACTIVE';
  
  const statusConfig = {
    REQUESTED: { color: 'text-status-pending bg-status-pending/10 border-status-pending/20', label: 'Pending' },
    ACTIVE: { color: isOverdue ? 'text-status-overdue bg-status-overdue/10 border-status-overdue/20' : 'text-status-pending bg-status-pending/10 border-status-pending/20', label: isOverdue ? 'Overdue' : 'Active' },
    RETURN_REQUESTED: { color: 'text-accent bg-accent/10 border-accent/20', label: 'Returning' },
    RETURNED: { color: 'text-status-returned bg-status-returned/10 border-status-returned/20', label: 'Returned' },
    CANCELLED: { color: 'text-ink-dim bg-surface-alt border-surface-alt', label: 'Cancelled' },
  };

  const config = statusConfig[entry.status] || statusConfig.REQUESTED;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <Card className="bg-surface border-surface-alt rounded-2xl p-6 h-[200px] flex flex-col justify-between shadow-sm hover:border-accent/30 transition-all">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <h3 className="text-xl font-medium text-ink">{entry.itemName || 'Unnamed Item'}</h3>
            <p className="text-sm text-ink-dim">
              {isLender ? `to ${entry.borrowerEmail || 'Unknown'}` : `from ${entry.lenderName || 'Unknown'}`}
            </p>
          </div>
          <Badge className={cn("text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border", config.color)}>
            {config.label}
          </Badge>
        </div>
        
        <div className="flex justify-between items-center">
          <div className="text-xs text-ink-dim">
            {entry.status === 'RETURNED' ? (
              <span>Verified</span>
            ) : (
              <span>
                {isOverdue && returnDate ? (
                  `Due ${format(returnDate, "MMM d")}`
                ) : (
                  createdAt ? (
                    `Lent ${formatDistanceToNow(createdAt, { addSuffix: true })}`
                  ) : (
                    'Just now'
                  )
                )}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            {/* Borrower Actions */}
            {!isLender && entry.status === 'REQUESTED' && (
              <>
                <Button size="sm" onClick={() => onUpdateStatus(entry.id, 'ACTIVE', { borrowerID: currentUserId })} className="bg-accent text-bg hover:bg-accent/90 rounded-full text-xs px-4 border-none">
                  Accept
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onUpdateStatus(entry.id, 'CANCELLED')} className="text-ink-dim hover:text-ink rounded-full text-xs px-4">
                  Reject
                </Button>
              </>
            )}

            {/* Active Actions */}
            {entry.status === 'ACTIVE' && (
              <Button 
                size="sm"
                variant="outline" 
                onClick={() => onUpdateStatus(entry.id, 'RETURN_REQUESTED', { returnRequestedBy: currentUserId })}
                className="border-accent text-accent hover:bg-accent hover:text-bg rounded-full text-xs px-4"
              >
                {isLender ? "Mark Returned" : "Return Item"}
              </Button>
            )}

            {/* Return Confirmation */}
            {entry.status === 'RETURN_REQUESTED' && entry.returnRequestedBy !== currentUserId && (
              <Button 
                size="sm"
                onClick={() => onUpdateStatus(entry.id, 'RETURNED')}
                className="bg-status-returned text-bg hover:bg-status-returned/90 rounded-full text-xs px-4 border-none"
              >
                Confirm Return
              </Button>
            )}

            {/* Ask Back */}
            {isLender && entry.status === 'ACTIVE' && (
              <Button 
                size="sm"
                variant="outline" 
                onClick={onAskBack}
                className={cn("rounded-full text-xs px-4", isOverdue ? "bg-status-overdue border-status-overdue text-white" : "border-accent text-accent")}
              >
                {isOverdue ? "Urgent Ping" : "Ask Back"}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

