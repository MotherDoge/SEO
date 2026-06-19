import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Target, 
  Users, 
  MessageSquare, 
  Save, 
  History, 
  Share2, 
  Languages, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Edit3,
  Copy,
  Trash2,
  LogOut,
  User as UserIcon,
  Globe
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { auth, signInWithGoogle, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  Timestamp, 
  doc, 
  updateDoc, 
  deleteDoc,
  setDoc
} from 'firebase/firestore';
import { generateGeoStrategy, refineContentPart, GeoStrategyResult } from './services/gemini';
import ReactMarkdown from 'react-markdown';

// --- Types ---

interface GeoStrategy extends GeoStrategyResult {
  id: string;
  userId: string;
  domain: string;
  goal: string;
  persona: string;
  coreMessage: string;
  language: string;
  createdAt: any;
  updatedAt: any;
}

// --- Components ---

const StepIndicator = ({ currentStep, totalSteps }: { currentStep: number, totalSteps: number }) => (
  <div className="flex gap-2 mb-8">
    {Array.from({ length: totalSteps }).map((_, i) => (
      <div 
        key={i} 
        className={`h-1 flex-1 rounded-full transition-all duration-500 ${
          i <= currentStep ? 'bg-primary' : 'bg-muted'
        }`}
      />
    ))}
  </div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({
    domain: '',
    goalType: 'Both',
    goalDetail: '',
    persona: '',
    coreMessage: '',
    language: 'English'
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [generatedStrategy, setGeneratedStrategy] = useState<GeoStrategy | null>(null);
  const [savedStrategies, setSavedStrategies] = useState<GeoStrategy[]>([]);
  const [activeTab, setActiveTab] = useState('create');
  const [isAuthReady, setIsAuthReady] = useState(false);

  const contentRef = useRef<string>('');

  // --- Auth & Initial Data ---

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setIsAuthReady(true);
      setLoading(false);

      if (u) {
        // Sync user profile
        try {
          await setDoc(doc(db, 'users', u.uid), {
            uid: u.uid,
            email: u.email,
            displayName: u.displayName,
            photoURL: u.photoURL,
            updatedAt: Timestamp.now()
          }, { merge: true });
        } catch (error) {
          console.error("Error syncing user profile:", error);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !isAuthReady) return;

    // Simplified query to avoid index requirements for now
    const q = query(
      collection(db, 'content_ideas'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const strategies = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as GeoStrategy[];
      
      // Sort manually in memory to avoid index issues
      strategies.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      
      setSavedStrategies(strategies);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'content_ideas');
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  // --- Handlers ---

  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => setStep(s => s - 1);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const fullGoal = `${formData.goalType}: ${formData.goalDetail}`;
      const result = await generateGeoStrategy(
        formData.domain,
        fullGoal,
        formData.persona,
        formData.coreMessage,
        formData.language
      );
      
      const newStrategy: GeoStrategy = {
        ...result,
        id: Date.now().toString(), // Temporary ID
        userId: user?.uid || 'anonymous',
        ...formData,
        goal: fullGoal,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };
      
      setGeneratedStrategy(newStrategy);
      setStep(4);
    } catch (error) {
      console.error("Generation failed:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!user || !generatedStrategy) return;
    
    setIsSaving(true);
    try {
      const { id, ...strategyData } = generatedStrategy;
      
      // Ensure data is valid for Firestore validation
      const finalData = {
        ...strategyData,
        userId: user.uid,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      console.log('Saving strategy:', finalData);
      
      await addDoc(collection(db, 'content_ideas'), finalData);
      
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setActiveTab('library');
        setGeneratedStrategy(null);
        setStep(0);
        setFormData({ domain: '', goalType: 'Both', goalDetail: '', persona: '', coreMessage: '', language: 'English' });
      }, 1500);
    } catch (error) {
      console.error('Save failed:', error);
      handleFirestoreError(error, OperationType.CREATE, 'content_ideas');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditPart = async (instruction: string) => {
    if (!generatedStrategy) return;
    
    setIsGenerating(true);
    try {
      const refined = await refineContentPart(generatedStrategy.summary, instruction);
      const updated = { ...generatedStrategy, summary: refined, updatedAt: Timestamp.now() };
      setGeneratedStrategy(updated);
    } catch (error) {
      console.error("Refinement failed:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'content_ideas', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `content_ideas/${id}`);
    }
  };

  // --- Render Helpers ---

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cloud-dancer bg-[radial-gradient(ellipse_at_top,_var(--color-ice-melt)_0%,_transparent_50%)]">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="flex flex-col items-center gap-4"
        >
          <Sparkles className="w-12 h-12 text-navy" />
          <p className="text-sm font-medium text-slate-text uppercase tracking-widest">Aura Orchestrating...</p>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cloud-dancer bg-[radial-gradient(ellipse_at_top,_var(--color-ice-melt)_0%,_transparent_50%)] p-4">
        <Card className="w-full max-w-md border border-border shadow-2xl bg-white backdrop-blur-none">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-ice-melt/30 rounded-2xl flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-navy" />
            </div>
            <div>
              <CardTitle className="text-3xl font-bold tracking-tight text-navy">Aura Orchestrator</CardTitle>
              <CardDescription className="text-base mt-2 text-slate-text">
                Strategic content curation powered by intelligence.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={signInWithGoogle} 
              className="w-full h-12 text-lg font-medium transition-all hover:scale-[1.02] bg-navy text-white hover:bg-navy/90"
            >
              Get Started with Google
            </Button>
          </CardContent>
          <CardFooter className="justify-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Secure • Strategic • Seamless</p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cloud-dancer bg-[radial-gradient(ellipse_at_top,_var(--color-ice-melt)_0%,_transparent_50%)] text-slate-text selection:bg-ice-melt/40">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-cloud-dancer/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            <span className="font-bold text-xl tracking-tight hidden sm:inline-block">Aura</span>
          </div>
          
          <nav className="flex items-center gap-1">
            <Button 
              variant={activeTab === 'create' ? 'secondary' : 'ghost'} 
              size="sm"
              onClick={() => setActiveTab('create')}
              className="gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">Create</span>
            </Button>
            <Button 
              variant={activeTab === 'library' ? 'secondary' : 'ghost'} 
              size="sm"
              onClick={() => setActiveTab('library')}
              className="gap-2"
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">Library</span>
            </Button>
          </nav>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full">
              <UserIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium hidden md:inline-block">{user.displayName}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => signOut(auth)}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsContent value="create" className="mt-0">
            <div className={`mx-auto transition-all duration-500 ${step === 4 ? "max-w-5xl" : "max-w-2xl"}`}>
              <StepIndicator currentStep={step} totalSteps={5} />
              
              <AnimatePresence mode="wait">
                {step === 0 && (
                  <motion.div
                    key="step0"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="space-y-2">
                      <h2 className="text-3xl font-bold tracking-tight">What's the URL you want to optimize?</h2>
                      <p className="text-muted-foreground">Enter your URL (e.g. Okta.com).</p>
                    </div>
                    <Input 
                      placeholder="e.g. okta.com" 
                      value={formData.domain}
                      onChange={e => setFormData({ ...formData, domain: e.target.value })}
                      className="h-14 text-lg"
                    />
                    <Button 
                      className="w-full h-12" 
                      disabled={!formData.domain} 
                      onClick={handleNext}
                    >
                      Continue <ChevronRight className="ml-2 w-4 h-4" />
                    </Button>
                  </motion.div>
                )}

                {step === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="space-y-2">
                      <h2 className="text-3xl font-bold tracking-tight">What's the goal?</h2>
                      <p className="text-muted-foreground">Select your primary objective and provide details.</p>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Objective</Label>
                        <div className="flex gap-2 flex-wrap">
                          {['Increase brand awareness', 'Improve conversions', 'Both'].map(type => (
                            <Button 
                              key={type}
                              variant={formData.goalType === type ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setFormData({ ...formData, goalType: type })}
                              className="rounded-full"
                            >
                              {type}
                            </Button>
                          ))}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Goal Details (The Why)</Label>
                        <Textarea 
                          placeholder="e.g. We want to be seen as the thought leader in Zero Trust security to drive enterprise signups..." 
                          value={formData.goalDetail}
                          onChange={e => setFormData({ ...formData, goalDetail: e.target.value })}
                          className="min-h-[120px] text-lg"
                        />
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <Button variant="outline" className="flex-1 h-12" onClick={handleBack}>
                        <ChevronLeft className="mr-2 w-4 h-4" /> Back
                      </Button>
                      <Button 
                        className="flex-1 h-12" 
                        disabled={!formData.goalDetail} 
                        onClick={handleNext}
                      >
                        Continue <ChevronRight className="ml-2 w-4 h-4" />
                      </Button>
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="space-y-2">
                      <h2 className="text-3xl font-bold tracking-tight">Who is the persona?</h2>
                      <p className="text-muted-foreground">Describe your target audience in detail.</p>
                    </div>
                    <Textarea 
                      placeholder="e.g. Eco-conscious professionals aged 25-35 who value transparency..." 
                      value={formData.persona}
                      onChange={e => setFormData({ ...formData, persona: e.target.value })}
                      className="min-h-[150px] text-lg"
                    />
                    <div className="flex gap-4">
                      <Button variant="outline" className="flex-1 h-12" onClick={handleBack}>
                        <ChevronLeft className="mr-2 w-4 h-4" /> Back
                      </Button>
                      <Button 
                        className="flex-1 h-12" 
                        disabled={!formData.persona} 
                        onClick={handleNext}
                      >
                        Continue <ChevronRight className="ml-2 w-4 h-4" />
                      </Button>
                    </div>
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div
                    key="step3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="space-y-2">
                      <h2 className="text-3xl font-bold tracking-tight">Core Messaging (The Why)</h2>
                      <p className="text-muted-foreground">What's the one thing they should remember?</p>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Core Message</Label>
                        <Input 
                          placeholder="e.g. Identity is the new perimeter." 
                          value={formData.coreMessage}
                          onChange={e => setFormData({ ...formData, coreMessage: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Language</Label>
                        <div className="flex gap-2 flex-wrap">
                          {['English', 'Spanish', 'French', 'German', 'Japanese', 'Chinese'].map(lang => (
                            <Button 
                              key={lang}
                              variant={formData.language === lang ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setFormData({ ...formData, language: lang })}
                              className="rounded-full"
                            >
                              {lang}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <Button variant="outline" className="flex-1 h-12" onClick={handleBack}>
                        <ChevronLeft className="mr-2 w-4 h-4" /> Back
                      </Button>
                      <Button 
                        className="flex-1 h-12 gap-2" 
                        disabled={isGenerating} 
                        onClick={handleGenerate}
                      >
                        {isGenerating ? 'Orchestrating...' : 'Generate Strategy'} 
                        <Sparkles className="w-4 h-4" />
                      </Button>
                    </div>
                  </motion.div>
                )}

                {step === 4 && generatedStrategy && (
                  <motion.div
                    key="step4"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-8"
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h2 className="text-3xl font-bold tracking-tight">{generatedStrategy.title}</h2>
                        <div className="flex gap-2">
                          <Badge variant="secondary">{generatedStrategy.category}</Badge>
                          <Badge variant="outline" className="gap-1">
                            <Globe className="w-3 h-3" /> {generatedStrategy.language}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant={saveSuccess ? "default" : "outline"} 
                          size="sm" 
                          onClick={handleSave} 
                          disabled={isSaving || saveSuccess}
                          className="gap-2 min-w-[100px]"
                        >
                          {isSaving ? (
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                            >
                              <Sparkles className="w-4 h-4" />
                            </motion.div>
                          ) : saveSuccess ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                          {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save'}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-8 flex flex-col">
                      <Card className="overflow-hidden border border-border shadow-lg bg-white">
                        <CardHeader className="border-b bg-muted/30">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-2">
                              <MessageSquare className="w-4 h-4 text-primary" />
                              GEO Strategy Summary
                            </CardTitle>
                            <Dialog>
                              <DialogTrigger render={
                                <Button variant="ghost" size="sm" className="gap-2">
                                  <Edit3 className="w-4 h-4" /> Refine
                                </Button>
                              } />
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Refine Strategy</DialogTitle>
                                  <DialogDescription>
                                    Tell Aura how you want to modify this strategy.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="py-4">
                                  <Label htmlFor="instruction">Instructions</Label>
                                  <Textarea 
                                    id="instruction" 
                                    placeholder="e.g. Focus more on Reddit outreach, add more video content ideas..." 
                                    className="mt-2"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleEditPart((e.target as HTMLTextAreaElement).value);
                                        (e.target as HTMLTextAreaElement).closest('[role="dialog"]')?.querySelector('button[aria-label="Close"]')?.dispatchEvent(new MouseEvent('click'));
                                      }
                                    }}
                                  />
                                </div>
                                <DialogFooter>
                                  <Button onClick={(e) => {
                                    const input = (e.target as HTMLElement).closest('[role="dialog"]')?.querySelector('textarea');
                                    if (input) handleEditPart(input.value);
                                  }}>Apply Changes</Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </CardHeader>
                        <CardContent className="p-6">
                          <ScrollArea className="h-[600px] pr-4">
                            <div className="space-y-8">
                              <div className="prose prose-neutral dark:prose-invert max-w-none">
                                <ReactMarkdown>{generatedStrategy.summary}</ReactMarkdown>
                              </div>
                              
                              <Separator />
                              
                              <div className="space-y-6">
                                <h3 className="text-xl font-bold flex items-center gap-2">
                                  <Target className="w-5 h-5 text-primary" />
                                  Holistic Recommendations
                                </h3>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Technical SEO</h4>
                                    <ul className="space-y-1">
                                      {generatedStrategy.recommendations.technicalSEO?.map((item, i) => (
                                        <li key={i} className="text-sm flex items-start gap-2 group/item">
                                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                                          <span className="flex-1">{item}</span>
                                          <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-6 w-6 opacity-0 group-hover/item:opacity-100 transition-opacity"
                                            onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(item + ' technical seo')}`, '_blank')}
                                          >
                                            <Search className="w-3 h-3" />
                                          </Button>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>

                                  <div className="space-y-2">
                                    <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Off-Page SEO</h4>
                                    <ul className="space-y-1">
                                      {generatedStrategy.recommendations.offPageSEO?.map((item, i) => (
                                        <li key={i} className="text-sm flex items-start gap-2 group/item">
                                          <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 shrink-0" />
                                          <span className="flex-1">{item}</span>
                                          <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-6 w-6 opacity-0 group-hover/item:opacity-100 transition-opacity"
                                            onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(item + ' off-page seo')}`, '_blank')}
                                          >
                                            <Search className="w-3 h-3" />
                                          </Button>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>

                                  <div className="space-y-2">
                                    <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Channel Recommendations</h4>
                                    <ul className="space-y-1">
                                      {generatedStrategy.recommendations.onSite?.map((item, i) => (
                                        <li key={i} className="text-sm flex items-start gap-2 group/item">
                                          <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                                          <span className="flex-1">{item}</span>
                                          <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-6 w-6 opacity-0 group-hover/item:opacity-100 transition-opacity"
                                            onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(item + ' ' + generatedStrategy.domain)}`, '_blank')}
                                          >
                                            <Search className="w-3 h-3" />
                                          </Button>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>

                                  <div className="space-y-2">
                                    <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Community (Reddit/Forums)</h4>
                                    <div className="space-y-2">
                                      <p className="text-xs font-medium text-primary">Reddit:</p>
                                      <ul className="space-y-1">
                                        {generatedStrategy.recommendations.community.reddit?.map((item, i) => (
                                          <li key={i} className="text-sm flex items-start gap-2 group/item">
                                            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 shrink-0" />
                                            <span className="flex-1">{item}</span>
                                            <Button 
                                              variant="ghost" 
                                              size="icon" 
                                              className="h-6 w-6 opacity-0 group-hover/item:opacity-100 transition-opacity"
                                              onClick={() => {
                                                const query = item.toLowerCase().includes('r/') ? item : `reddit.com ${item}`;
                                                window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
                                              }}
                                            >
                                              <Search className="w-3 h-3" />
                                            </Button>
                                          </li>
                                        ))}
                                      </ul>
                                      <p className="text-xs font-medium text-primary">Forums:</p>
                                      <ul className="space-y-1">
                                        {generatedStrategy.recommendations.community.forums?.map((item, i) => (
                                          <li key={i} className="text-sm flex items-start gap-2 group/item">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                                            <span className="flex-1">{item}</span>
                                            <Button 
                                              variant="ghost" 
                                              size="icon" 
                                              className="h-6 w-6 opacity-0 group-hover/item:opacity-100 transition-opacity"
                                              onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(item + ' forum')}`, '_blank')}
                                            >
                                              <Search className="w-3 h-3" />
                                            </Button>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Multimedia Formats</h4>
                                    <ul className="space-y-1">
                                      {generatedStrategy.recommendations.multimedia?.map((item, i) => (
                                        <li key={i} className="text-sm flex items-start gap-2 group/item">
                                          <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                                          <span className="flex-1">{item}</span>
                                          <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-6 w-6 opacity-0 group-hover/item:opacity-100 transition-opacity"
                                            onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(item + ' ' + generatedStrategy.domain)}`, '_blank')}
                                          >
                                            <Search className="w-3 h-3" />
                                          </Button>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>

                                  <div className="space-y-2">
                                    <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Outreach & Tools</h4>
                                    <div className="space-y-2">
                                      <p className="text-xs font-medium text-primary">Blogs & Influencers:</p>
                                      <ul className="space-y-1">
                                        {generatedStrategy.recommendations.outreach.blogs?.map((item, i) => (
                                          <li key={i} className="text-sm flex items-start gap-2 group/item">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 shrink-0" />
                                            <span className="flex-1">{item}</span>
                                          </li>
                                        ))}
                                        {generatedStrategy.recommendations.outreach.influencers?.map((item, i) => (
                                          <li key={i} className="text-sm flex items-start gap-2 group/item">
                                            <div className="w-1.5 h-1.5 rounded-full bg-pink-500 mt-1.5 shrink-0" />
                                            <span className="flex-1">{item}</span>
                                          </li>
                                        ))}
                                      </ul>
                                      <p className="text-xs font-medium text-primary">Interactive Tools:</p>
                                      <ul className="space-y-1">
                                        {generatedStrategy.recommendations.tools?.map((item, i) => (
                                          <li key={i} className="text-sm flex items-start gap-2 group/item">
                                            <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0" />
                                            <span className="flex-1">{item}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>

                      <div className="w-full">
                        <Card className="border border-border shadow-md overflow-hidden bg-white">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">The Aura Logic</CardTitle>
                          </CardHeader>
                          <CardContent className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                              <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-navy flex items-center justify-center text-[11px] font-bold text-white shadow-lg shadow-navy/20">WHY</div>
                                  <h4 className="font-bold text-lg text-navy">Strategic Purpose</h4>
                                </div>
                                <p className="text-slate-text leading-relaxed pl-13">{generatedStrategy.strategy.why}</p>
                              </div>
                              
                              <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-navy/80 flex items-center justify-center text-[11px] font-bold text-white">HOW</div>
                                  <h4 className="font-bold text-lg text-navy/80">Appeal & Action</h4>
                                </div>
                                <p className="text-slate-text leading-relaxed pl-13">{generatedStrategy.strategy.how}</p>
                              </div>

                              <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-navy/60 flex items-center justify-center text-[11px] font-bold text-white">WHAT</div>
                                  <h4 className="font-bold text-lg text-navy/60">Specific Narrative</h4>
                                </div>
                                <p className="text-slate-text leading-relaxed pl-13">{generatedStrategy.strategy.what}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        </div>
                      </div>
                    
                    <div className="flex justify-center pt-8">
                      <Button variant="ghost" onClick={() => setStep(0)} className="text-muted-foreground">
                        Start New Orchestration
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </TabsContent>

          <TabsContent value="library" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {savedStrategies.length === 0 ? (
                <div className="col-span-full py-20 text-center space-y-4">
                  <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                    <History className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-semibold">No saved strategies yet</h3>
                    <p className="text-muted-foreground">Start orchestrating to build your GEO library.</p>
                  </div>
                  <Button onClick={() => setActiveTab('create')}>Create First Strategy</Button>
                </div>
              ) : (
                savedStrategies.map((strategy) => (
                  <motion.div
                    key={strategy.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card className="h-full flex flex-col hover:shadow-xl transition-shadow border border-border bg-white group hover:border-ice-melt/50">
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-start">
                          <Badge variant="outline" className="mb-2">{strategy.category}</Badge>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                            onClick={() => handleDelete(strategy.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <CardTitle className="text-xl leading-tight">{strategy.title}</CardTitle>
                        <CardDescription className="line-clamp-2 mt-2">{strategy.goal}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex-1 pb-4">
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {strategy.language}
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter className="pt-0">
                        <Button 
                          variant="secondary" 
                          className="w-full gap-2"
                          onClick={() => {
                            setGeneratedStrategy(strategy);
                            setStep(4);
                            setActiveTab('create');
                          }}
                        >
                          View Details <ChevronRight className="w-4 h-4" />
                        </Button>
                      </CardFooter>
                    </Card>
                  </motion.div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t py-12 bg-muted/30">
        <div className="container mx-auto px-4 text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="font-bold tracking-tight">Aura Orchestrator</span>
          </div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Empowering content creators with strategic intelligence and seamless collaboration.
          </p>
          <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground uppercase tracking-widest">
            <span>Secure</span>
            <span>Real-time</span>
            <span>Multi-lingual</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
