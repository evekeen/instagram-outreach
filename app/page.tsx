'use client';

import { Box, Button, Container, Heading, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay, Table, Tbody, Td, Text, Th, Thead, Tr, useToast, Spinner, Center, Progress, Badge, Stack, Accordion, AccordionItem, AccordionButton, AccordionPanel, AccordionIcon, Divider, Code, Flex, Link, Menu, MenuButton, MenuList, MenuItem, MenuDivider, IconButton } from '@chakra-ui/react';
import { useState, useEffect, useRef } from 'react';
import { Influencer } from './lib/db';

interface EmailDraft {
  subject: string;
  body: string;
}

type ProgressStage = 'start' | 'hashtags' | 'profiles' | 'emails' | 'browser' | 'complete' | 'error' | 'warning';

interface ProgressUpdate {
  stage: ProgressStage;
  message: string;
  timestamp: number;
  data?: any;
}

export default function Home() {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [emailDraft, setEmailDraft] = useState<EmailDraft>({ subject: '', body: '' });
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [isSendingDM, setIsSendingDM] = useState<boolean>(false);
  const [showOnlyInfluencers, setShowOnlyInfluencers] = useState<boolean>(true);
  const [filteredInfluencers, setFilteredInfluencers] = useState<Influencer[]>([]);
  const [isOutreachModalOpen, setIsOutreachModalOpen] = useState<boolean>(false);
  const [isRunningOutreach, setIsRunningOutreach] = useState<boolean>(false);
  const [outreachLogs, setOutreachLogs] = useState<string[]>([]);
  const [progressUpdates, setProgressUpdates] = useState<ProgressUpdate[]>([]);
  const [currentStage, setCurrentStage] = useState<ProgressStage | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [isYoloModalOpen, setIsYoloModalOpen] = useState<boolean>(false);
  const [isRunningYolo, setIsRunningYolo] = useState<boolean>(false);
  const [yoloLogs, setYoloLogs] = useState<string[]>([]);
  const [yoloProgress, setYoloProgress] = useState<any>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const yoloLogsEndRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const isFirstRenderRef = useRef<boolean>(true);

  const fetchInfluencers = async (): Promise<void> => {
    try {
      const response = await fetch('/api/influencers');
      const data = await response.json() as Influencer[];
      setInfluencers(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load influencers',
        status: 'error',
        duration: 3000,
      });
    }
  };
  
  // This useEffect is replaced by the one using fetchInfluencersWithLoading

  const generateEmailDraft = async (influencer: Influencer, forceRegenerate: boolean = false): Promise<void> => {
    try {
      setSelectedInfluencer(influencer);
      setIsModalOpen(true);
      
      // Check if we already have a stored draft and are not forcing regeneration
      if (!forceRegenerate && influencer.email_subject && influencer.email_body) {
        console.log('Using existing email draft from database');
        setEmailDraft({
          subject: influencer.email_subject,
          body: influencer.email_body
        });
        return;
      }
      
      // No stored draft or regeneration requested, generate a new one
      setIsGenerating(true);
      if (forceRegenerate) {
        setIsRegenerating(true);
      }
      
      const response = await fetch('/api/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ influencer }),
      });
      const data = await response.json() as EmailDraft;
      setEmailDraft(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate email draft',
        status: 'error',
        duration: 3000,
      });
      if (!influencer.email_subject && !influencer.email_body) {
        setIsModalOpen(false);
      }
    } finally {
      setIsGenerating(false);
      setIsRegenerating(false);
    }
  };

  const sendEmail = async (): Promise<void> => {
    if (!selectedInfluencer || !selectedInfluencer.email) {
      toast({
        title: 'Error',
        description: 'No email address available for this influencer',
        status: 'error',
        duration: 3000,
      });
      return;
    }

    try {
      setIsSending(true);
      
      // First save any changes to the draft
      const saveResponse = await fetch('/api/save-email-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: selectedInfluencer.username,
          subject: emailDraft.subject,
          body: emailDraft.body
        }),
      });
      
      if (!saveResponse.ok) {
        console.warn('Failed to save email draft before sending');
      }
      
      // Then send the email
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedInfluencer.email,
          subject: emailDraft.subject,
          body: emailDraft.body,
          influencer: selectedInfluencer
        }),
      });
      
      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      toast({
        title: 'Success',
        description: 'Email sent successfully',
        status: 'success',
        duration: 3000,
      });
      
      // Update the local state to reflect the sent status
      if (selectedInfluencer) {
        setInfluencers(prevInfluencers => 
          prevInfluencers.map(inf => 
            inf.username === selectedInfluencer.username 
              ? {...inf, email_sent: true, email_sent_at: new Date().toISOString()}
              : inf
          )
        );
      }
      
      // Close the modal after sending
      setIsModalOpen(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send email',
        status: 'error',
        duration: 3000,
      });
    } finally {
      setIsSending(false);
    }
  };

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Apply filters to the influencers list
  const applyFilters = () => {
    let filtered = [...influencers];
    
    if (showOnlyInfluencers) {
      filtered = filtered.filter(inf => inf.is_influencer);
    }
    
    setFilteredInfluencers(filtered);
  };

  // Override fetchInfluencers to handle loading state
  const fetchInfluencersWithLoading = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await fetchInfluencers();
    } finally {
      setIsLoading(false);
    }
  };

  // Effect to apply filters whenever influencers or filter settings change
  useEffect(() => {
    applyFilters();
  }, [influencers, showOnlyInfluencers]);

  // Replace the useEffect to use the new function and check process status on mount
  useEffect(() => {
    fetchInfluencersWithLoading();
    
    // Check if there's a running outreach process on initial load
    checkOutreachStatus();
    
    // Mark as not first render anymore
    isFirstRenderRef.current = false;
  }, []);
  
  // Polling interval for status updates
  const [statusPollingInterval, setStatusPollingInterval] = useState<NodeJS.Timeout | null>(null);
  // Add state to track if we've already shown a stopped notification
  const [stoppedNotificationShown, setStoppedNotificationShown] = useState<boolean>(false);
  
  // Scroll logs to bottom when new logs are added
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [outreachLogs]);
  
  // Clean up polling when component unmounts
  useEffect(() => {
    return () => {
      if (statusPollingInterval) {
        clearInterval(statusPollingInterval);
      }
    };
  }, [statusPollingInterval]);
  
  // Check outreach status when modal is opened
  useEffect(() => {
    if (isOutreachModalOpen) {
      checkOutreachStatus();
    }
  }, [isOutreachModalOpen, statusPollingInterval]);
  
  // Function to check current outreach status
  const checkOutreachStatus = async () => {
    try {
      const response = await fetch('/api/outreach-status');
      const data = await response.json();
      
      // If a process is running, update UI state accordingly
      if (data.status === 'running') {
        setIsRunningOutreach(true);
        // Reset the stopped notification flag when process starts running
        setStoppedNotificationShown(false);
        
        // If this is the initial check and we found a running process,
        // automatically open the modal to show progress
        if (isFirstRenderRef.current) {
          setIsOutreachModalOpen(true);
        }
        
        // Update logs and progress if available
        if (data.logs) {
          setOutreachLogs(data.logs.map((log: any) => log.message));
        }
        
        if (data.progress) {
          // Update current stage (skip detail stages)
          if (!data.progress.stage.includes('_detail')) {
            setCurrentStage(data.progress.stage as ProgressStage);
          }
          
          // Add to progress updates
          const newUpdate = {
            stage: data.progress.stage,
            message: data.progress.message,
            timestamp: data.progress.timestamp,
            data: data.progress.data || {}
          };
          
          setProgressUpdates(prev => {
            // Only add if it's not already there (based on timestamp)
            if (!prev.find(update => update.timestamp === newUpdate.timestamp)) {
              return [...prev, newUpdate];
            }
            return prev;
          });
        }
        
        // Start polling for updates if not already polling
        if (!statusPollingInterval) {
          const interval = setInterval(pollStatus, 1000);
          setStatusPollingInterval(interval);
        }
      } else if ((data.status === 'not_running' || data.status === 'stopped' || data.status === 'error') && isRunningOutreach) {
        // Reset the running state if process is not running but our UI still thinks it is
        setIsRunningOutreach(false);
        
        // Clear polling if it exists
        if (statusPollingInterval) {
          clearInterval(statusPollingInterval);
          setStatusPollingInterval(null);
        }
        
        // If process is stopped, update stage and mark notification as shown
        if (data.progress && data.progress.stage === 'stopped') {
          setCurrentStage('stopped');
          setStoppedNotificationShown(true);
        }
        
        // Display appropriate message based on status - but only if we haven't shown a stopped notification yet
        if (data.status === 'error' && data.progress) {
          toast({
            title: 'Error',
            description: data.progress.message || 'An error occurred during the outreach process',
            status: 'error',
            duration: 5000,
            isClosable: true,
          });
          
          // Update the progress state to show error
          setCurrentStage('error');
          
          // Add final error update to progress updates
          const errorUpdate = {
            stage: 'error',
            message: data.progress.message || 'Process failed',
            timestamp: data.progress.timestamp || Date.now(),
            data: data.progress.data || {}
          };
          
          setProgressUpdates(prev => {
            if (!prev.find(update => update.timestamp === errorUpdate.timestamp)) {
              return [...prev, errorUpdate];
            }
            return prev;
          });
        } else if (data.status === 'stopped' && data.progress && !stoppedNotificationShown) {
          // Only show stopped message if we haven't shown it yet
          toast({
            title: 'Process Stopped',
            description: data.progress.message || 'Outreach process has been stopped',
            status: 'warning',
            duration: 5000,
            isClosable: true,
          });
          
          // Update logs to reflect stopped status (only once)
          setOutreachLogs(prev => [...prev, 'Process was stopped manually']);
          
          // Mark that we've shown the notification
          setStoppedNotificationShown(true);
        }
      }
    } catch (error) {
      console.error('Error checking outreach status:', error);
    }
  };
  
  // Function to poll for status updates
  const pollStatus = async () => {
    try {
      const response = await fetch('/api/outreach-status');
      const data = await response.json();
      
      // If data status is not_running and we're not in running state, don't update anything
      if (data.status === 'not_running' && !isRunningOutreach) {
        return;
      }
      
      // Check if process is running and update our state accordingly
      if (data.status === 'running' && !isRunningOutreach) {
        setIsRunningOutreach(true);
        // Reset the stopped notification flag when process starts running
        setStoppedNotificationShown(false);
      }
      
      // Update state with the latest data
      if (data.logs) {
        setOutreachLogs(data.logs.map((log: any) => log.message));
      }
      
      if (data.progress) {
        // Update current stage (skip detail stages)
        if (!data.progress.stage.includes('_detail')) {
          setCurrentStage(data.progress.stage as ProgressStage);
        }
        
        // Add to progress updates if it's a new update
        const newUpdate = {
          stage: data.progress.stage,
          message: data.progress.message,
          timestamp: data.progress.timestamp,
          data: data.progress.data || {}
        };
        
        setProgressUpdates(prev => {
          // Only add if it's not already there (based on timestamp)
          if (!prev.find(update => update.timestamp === newUpdate.timestamp)) {
            return [...prev, newUpdate];
          }
          return prev;
        });
        
        // Set running state based on progress data
        const wasRunning = isRunningOutreach;
        const isNowStopped = !data.progress.is_running;
        
        // Only update running state if it has changed
        if (wasRunning && isNowStopped) {
          setIsRunningOutreach(false);
          
          // Handle process end
          if (statusPollingInterval) {
            clearInterval(statusPollingInterval);
            setStatusPollingInterval(null);
          }
        } else if (!wasRunning && data.progress.is_running) {
          setIsRunningOutreach(true);
          setStoppedNotificationShown(false); // Reset notification flag
        }
        
        // Check if process is finished and show appropriate notification
        if (wasRunning && isNowStopped) {
          // Show toast notification only once based on stage
          if (data.progress.stage === 'complete') {
            toast({
              title: 'Success',
              description: data.progress.message || 'Outreach process completed successfully',
              status: 'success',
              duration: 5000,
              isClosable: true,
            });
            
            // Add final message to logs
            setOutreachLogs(prev => [...prev, 'Process completed successfully']);
            
            // Update the current stage
            setCurrentStage('complete');
            
            // Refresh the influencer list
            fetchInfluencersWithLoading();
            
            // Show a success message that will auto-close
            setTimeout(() => {
              toast({
                title: 'Process Completed',
                description: 'The outreach process has finished successfully. New influencers are now available in your database.',
                status: 'success',
                duration: 7000,
                isClosable: true,
              });
            }, 3000);
          } else if (data.progress.stage === 'error') {
            toast({
              title: 'Error',
              description: data.progress.message || 'An error occurred during the outreach process',
              status: 'error',
              duration: 5000,
              isClosable: true,
            });
            
            // Add error to logs
            setOutreachLogs(prev => [...prev, `Error: ${data.progress.message || 'Process failed with an error'}`]);
          } else if (data.progress.stage === 'stopped' && !stoppedNotificationShown) {
            toast({
              title: 'Process Stopped',
              description: data.progress.message || 'Process was manually stopped',
              status: 'warning',
              duration: 5000,
              isClosable: true,
            });
            
            // Add stopped message to logs (only once)
            setOutreachLogs(prev => [...prev, 'Process was stopped manually']);
            
            // Mark that we've shown the notification
            setStoppedNotificationShown(true);
          }
        }
      }
      
      // Handle status transitions
      if ((data.status === 'stopped' || data.status === 'error') && isRunningOutreach) {
        setIsRunningOutreach(false);
        
        if (data.status === 'error' && !data.progress) {
          // Handle error without progress data
          toast({
            title: 'Error',
            description: data.message || 'An error occurred during the outreach process',
            status: 'error',
            duration: 5000,
            isClosable: true,
          });
          
          setCurrentStage('error');
          setOutreachLogs(prev => [...prev, `Error: ${data.message || 'Unknown error occurred'}`]);
        }
      }
    } catch (error) {
      console.error('Error polling status:', error);
      
      // On network error, don't stop polling entirely, but log the error
      setOutreachLogs(prev => [...prev, `Network error: Unable to check status (${error})`]);
    }
  };
  
  const runOutreach = async () => {
    // Reset state
    setOutreachLogs([]);
    setProgressUpdates([]);
    setCurrentStage(null);
    setStoppedNotificationShown(false);
    
    // Show a loading message but don't set running flag until we confirm the process is running
    setOutreachLogs(prev => [...prev, 'Starting outreach process...']);
    
    try {
      // Start the outreach process
      const response = await fetch('/api/run-outreach');
      const data = await response.json();
      
      if (data.status === 'already_running') {
        toast({
          title: 'Process Already Running',
          description: 'An outreach process is already running',
          status: 'info',
          duration: 3000,
        });
        setIsRunningOutreach(true); // Set running state for existing process
      } else if (data.status === 'error') {
        toast({
          title: 'Error',
          description: data.message,
          status: 'error',
          duration: 3000,
        });
        // Show the error in logs
        setOutreachLogs(prev => [...prev, `Error: ${data.message || 'Failed to start process'}`]);
        return;
      } else if (data.status === 'started') {
        // Process was successfully started
        // We'll only set the isRunningOutreach flag after confirming the process is active
        setOutreachLogs(prev => [...prev, 'Process initiated. Starting monitoring...']);
        
        // Wait briefly for the process to initialize
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Clear any existing polling interval
      if (statusPollingInterval) {
        clearInterval(statusPollingInterval);
      }
      
      // Now check if the process is actually running before setting up polling
      const initialStatusResponse = await fetch('/api/outreach-status');
      const initialStatus = await initialStatusResponse.json();
      
      // Check if the process has actually started running
      if (initialStatus.status === 'running' && initialStatus.progress?.is_running) {
        // Set running state now that we've confirmed the process is running
        setIsRunningOutreach(true);
        
        // Update logs and progress with initial data
        if (initialStatus.logs) {
          setOutreachLogs(initialStatus.logs.map((log: any) => log.message));
        }
        
        if (initialStatus.progress) {
          if (!initialStatus.progress.stage.includes('_detail')) {
            setCurrentStage(initialStatus.progress.stage as ProgressStage);
          }
        }
        
        // Set up regular polling
        const interval = setInterval(pollStatus, 1000);
        setStatusPollingInterval(interval);
      } else {
        // Process didn't start properly
        setOutreachLogs(prev => [...prev, 'Process failed to start. Please try again.']);
        toast({
          title: 'Warning',
          description: 'The process may not have started correctly. Please try again.',
          status: 'warning',
          duration: 5000,
        });
      }
    } catch (error) {
      console.error('Error starting outreach process:', error);
      setOutreachLogs(prev => [...prev, `Setup error: ${error}`]);
    }
  };
  
  const stopOutreach = async () => {
    try {
      // Mark notification as shown immediately when user manually stops
      // This prevents duplicate notifications
      setStoppedNotificationShown(true);
      
      // Send stop command
      const response = await fetch('/api/outreach-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'stop' })
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        setOutreachLogs(prev => [...prev, 'Stop command sent. Waiting for process to stop...']);
        
        // Manually show a toast since we'll suppress automatic ones
        toast({
          title: 'Stopping Process',
          description: 'Stop command sent. The process will stop shortly.',
          status: 'info',
          duration: 3000,
        });
        
        // Continue polling to see when it actually stops
        if (!statusPollingInterval) {
          const interval = setInterval(pollStatus, 1000);
          setStatusPollingInterval(interval);
        }
      } else {
        toast({
          title: 'Error',
          description: 'Failed to stop the process',
          status: 'error',
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('Error stopping outreach process:', error);
      toast({
        title: 'Error',
        description: 'Failed to send stop command',
        status: 'error',
        duration: 3000,
      });
    }
  };
  
  const getStageColor = (stage: ProgressStage): string => {
    switch (stage) {
      case 'start': return 'blue';
      case 'hashtags': return 'purple';
      case 'profiles': return 'cyan';
      case 'emails': return 'green';
      case 'browser': return 'orange';
      case 'complete': return 'green';
      case 'error': return 'red';
      case 'warning': return 'yellow';
      default: return 'gray';
    }
  };
  
  const getProgressPercentage = (): number => {
    if (!currentStage) return 0;
    
    // Find the most recent percent value from any update
    // Sort in reverse order to find the most recent first
    const sortedUpdates = [...progressUpdates].sort((a, b) => b.timestamp - a.timestamp);
    
    // Look for the latest updates with percent data
    for (const update of sortedUpdates) {
      if (update.data?.percent) {
        return update.data.percent;
      }
    }
    
    // Otherwise calculate based on stage
    const stages: ProgressStage[] = ['init', 'start', 'hashtags', 'profiles', 'emails', 'browser', 'complete'];
    const currentIndex = stages.indexOf(currentStage);
    
    if (currentIndex === -1) return 0;
    return Math.round((currentIndex / (stages.length - 1)) * 100);
  };
  
  // Function to reset the database
  const updateInfluencerStatus = async (username: string, statusType: string, value: boolean) => {
    try {
      const response = await fetch('/api/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, statusType, value }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Update local state
        setInfluencers(prevInfluencers => 
          prevInfluencers.map(inf => {
            if (inf.username === username) {
              switch (statusType) {
                case 'email_sent':
                  return {...inf, email_sent: value, email_sent_at: value ? new Date().toISOString() : null};
                case 'dm_sent':
                  return {...inf, dm_sent: value, dm_sent_at: value ? new Date().toISOString() : null};
                case 'reset':
                  return {...inf, email_sent: false, email_sent_at: null, dm_sent: false, dm_sent_at: null};
                default:
                  return inf;
              }
            }
            return inf;
          })
        );
        
        toast({
          title: 'Status Updated',
          description: statusType === 'reset' ? 'All statuses reset' : `${statusType.replace('_', ' ')} marked as ${value ? 'sent' : 'not sent'}`,
          status: 'success',
          duration: 2000,
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update status',
        status: 'error',
        duration: 3000,
      });
    }
  };

  // YOLO process functions
  const [yoloPollingInterval, setYoloPollingInterval] = useState<NodeJS.Timeout | null>(null);
  
  const checkYoloStatus = async () => {
    try {
      const response = await fetch('/api/yolo-status');
      const data = await response.json();
      
      if (data.status === 'running') {
        setIsRunningYolo(true);
        
        if (data.progress) {
          setYoloProgress(data.progress);
          
          // Add to logs
          if (data.progress.message) {
            setYoloLogs(prev => [...prev, `${data.progress.stage}: ${data.progress.message}`]);
          }
        }
        
        // Start polling if not already polling
        if (!yoloPollingInterval) {
          const interval = setInterval(pollYoloStatus, 1000);
          setYoloPollingInterval(interval);
        }
      } else if (data.status === 'complete' || data.status === 'error') {
        setIsRunningYolo(false);
        
        if (yoloPollingInterval) {
          clearInterval(yoloPollingInterval);
          setYoloPollingInterval(null);
        }
        
        if (data.status === 'complete') {
          toast({
            title: 'YOLO Complete',
            description: data.progress?.message || 'Automated outreach completed successfully',
            status: 'success',
            duration: 5000,
            isClosable: true,
          });
          
          // Refresh influencer list
          fetchInfluencersWithLoading();
        } else {
          toast({
            title: 'YOLO Error',
            description: data.progress?.message || 'An error occurred during YOLO process',
            status: 'error',
            duration: 5000,
            isClosable: true,
          });
        }
      }
    } catch (error) {
      console.error('Error checking YOLO status:', error);
    }
  };
  
  const pollYoloStatus = async () => {
    try {
      const response = await fetch('/api/yolo-status');
      const data = await response.json();
      
      if (data.progress) {
        setYoloProgress(data.progress);
        
        if (data.progress.message && !yoloLogs.includes(`${data.progress.stage}: ${data.progress.message}`)) {
          setYoloLogs(prev => [...prev, `${data.progress.stage}: ${data.progress.message}`]);
        }
      }
      
      if (data.status !== 'running') {
        setIsRunningYolo(false);
        
        if (yoloPollingInterval) {
          clearInterval(yoloPollingInterval);
          setYoloPollingInterval(null);
        }
        
        if (data.status === 'complete') {
          toast({
            title: 'YOLO Complete!',
            description: 'Automated outreach process finished successfully',
            status: 'success',
            duration: 7000,
            isClosable: true,
          });
          fetchInfluencersWithLoading();
        }
      }
    } catch (error) {
      console.error('Error polling YOLO status:', error);
    }
  };
  
  const runYolo = async () => {
    setYoloLogs([]);
    setYoloProgress(null);
    
    try {
      const response = await fetch('/api/run-yolo');
      const data = await response.json();
      
      if (data.status === 'started') {
        setIsRunningYolo(true);
        setYoloLogs(['Starting YOLO automated outreach process...']);
        
        // Start polling for status
        const interval = setInterval(pollYoloStatus, 1000);
        setYoloPollingInterval(interval);
      } else if (data.status === 'already_running') {
        toast({
          title: 'Already Running',
          description: 'YOLO process is already running',
          status: 'info',
          duration: 3000,
        });
        setIsRunningYolo(true);
      } else {
        toast({
          title: 'Error',
          description: data.message || 'Failed to start YOLO process',
          status: 'error',
          duration: 5000,
        });
      }
    } catch (error) {
      console.error('Error starting YOLO:', error);
      toast({
        title: 'Error',
        description: 'Failed to start YOLO process',
        status: 'error',
        duration: 5000,
      });
    }
  };
  
  const stopYolo = async () => {
    try {
      const response = await fetch('/api/run-yolo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'stop' })
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        setYoloLogs(prev => [...prev, 'Stop command sent...']);
        toast({
          title: 'Stopping YOLO',
          description: 'Stop command sent. Process will stop shortly.',
          status: 'info',
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('Error stopping YOLO:', error);
      toast({
        title: 'Error',
        description: 'Failed to stop YOLO process',
        status: 'error',
        duration: 3000,
      });
    }
  };
  
  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (yoloPollingInterval) {
        clearInterval(yoloPollingInterval);
      }
    };
  }, [yoloPollingInterval]);
  
  // Check YOLO status when modal opens
  useEffect(() => {
    if (isYoloModalOpen) {
      checkYoloStatus();
    }
  }, [isYoloModalOpen]);

  const resetDatabase = async () => {
    try {
      setIsResetting(true);
      
      // Call the reset API
      const response = await fetch('/api/reset-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'reset-token-12345' }) // Simple token for demo, use proper auth in production
      });
      
      const result = await response.json();
      
      if (result.status === 'success') {
        toast({
          title: 'Database Reset',
          description: 'Database has been cleared successfully.',
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
        
        // Refresh the influencer list
        await fetchInfluencersWithLoading();
      } else {
        toast({
          title: 'Reset Failed',
          description: result.message || 'Failed to reset database.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    } catch (error) {
      console.error('Error resetting database:', error);
      toast({
        title: 'Reset Failed',
        description: 'An error occurred while resetting the database.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsResetting(false);
      setIsResetModalOpen(false);
    }
  };

  return (
    <Container maxW="container.xl" py={8}>
      {/* Add global CSS for animations */}
      <style jsx global>{`
        @keyframes spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        
        @keyframes pulse {
          0% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.5; }
          50% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; }
          100% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.5; }
        }
        
        @keyframes pulse2 {
          0% { transform: scale(0.95); opacity: 0.5; }
          50% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(0.95); opacity: 0.5; }
        }
        
        @keyframes shimmer {
          0% { background-position: 0% 0; }
          100% { background-position: 200% 0; }
        }
        
        @keyframes float1 {
          0% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0); }
        }
        
        @keyframes float2 {
          0% { transform: translateY(0); }
          50% { transform: translateY(10px); }
          100% { transform: translateY(0); }
        }
      `}</style>
      
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={6}>
        <Box>
          {influencers.length > 0 && (
            <Text fontSize="sm" color="gray.500" mt={1}>
              Showing {filteredInfluencers.length} of {influencers.length} influencers
            </Text>
          )}
        </Box>
        
        <Box display="flex" gap={2}>
          <Button
            colorScheme="green"
            leftIcon={<span role="img" aria-label="rocket">🚀</span>}
            onClick={() => setIsYoloModalOpen(true)}
            size="lg"
            fontWeight="bold"
            bgGradient="linear(to-r, green.400, teal.500)"
            _hover={{
              bgGradient: "linear(to-r, green.500, teal.600)",
            }}
          >
            YOLO
          </Button>
          
          <Button
            colorScheme="purple"
            leftIcon={<span role="img" aria-label="search">🔍</span>}
            onClick={() => setIsOutreachModalOpen(true)}
          >
            Find New Influencers
          </Button>
          
          <Button
            colorScheme="red"
            variant="outline"
            leftIcon={<span role="img" aria-label="delete">🗑️</span>}
            onClick={() => setIsResetModalOpen(true)}
          >
            Reset Database
          </Button>
        </Box>
        
        <Box>
          <Box 
            as="label" 
            display="flex" 
            alignItems="center" 
            cursor="pointer"
            padding="2"
            borderRadius="md"
            bgColor={showOnlyInfluencers ? "green.100" : "transparent"}
            border="1px solid"
            borderColor={showOnlyInfluencers ? "green.300" : "gray.200"}
            boxShadow={showOnlyInfluencers ? "0 0 0 1px green.200" : "none"}
            transition="all 0.2s"
          >
            <input 
              type="checkbox" 
              checked={showOnlyInfluencers} 
              onChange={() => setShowOnlyInfluencers(!showOnlyInfluencers)}
              style={{ marginRight: '8px' }}
            />
            <Text fontSize="sm" fontWeight={showOnlyInfluencers ? "bold" : "medium"} color={showOnlyInfluencers ? "green.700" : "gray.700"}>
              Only Influencers
            </Text>
          </Box>                    
        </Box>
      </Box>
      
      {isLoading ? (
        <Center py={10}>
          <Spinner size="xl" thickness="4px" speed="0.65s" color="blue.500" />
        </Center>
      ) : (
        <Box overflowX="auto">
          {filteredInfluencers.length === 0 ? (
            <Center py={10}>
              <Text fontSize="lg">
                {influencers.length === 0 
                  ? "No influencers found in the database" 
                  : !showOnlyInfluencers 
                    ? "No influencers match the current filters"
                    : "No influencers found. Try unchecking 'Only Influencers' to see all users."}
              </Text>
            </Center>
          ) : (
            <Table variant="simple">
              <Thead>
                <Tr>
                  <Th>Username</Th>
                  <Th>Full Name</Th>
                  <Th>Email</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredInfluencers.map((influencer) => (
                  <Tr key={influencer.username}>
                    <Td>
                      <Link 
                        href={`https://instagram.com/${influencer.username}`}
                        isExternal
                        color="blue.600"
                        fontWeight="medium"
                        _hover={{ 
                          textDecoration: 'underline',
                          color: 'blue.700'
                        }}
                      >
                        @{influencer.username}
                      </Link>
                    </Td>
                    <Td>{influencer.full_name}</Td>
                    <Td>{influencer.email}</Td>
                    <Td>
                      <Box>
                        {!!influencer.email_sent && (
                          <Text color="green.500" fontWeight="bold" fontSize="sm">
                            ✉️ Email sent
                          </Text>
                        )}
                        {!!influencer.dm_sent && (
                          <Text color="purple.500" fontWeight="bold" fontSize="sm">
                            📱 DM sent
                          </Text>
                        )}
                        {!influencer.email_sent && !influencer.dm_sent && (
                          influencer.email_subject && influencer.email_body ? (
                            <Text color="blue.500" fontSize="sm">
                              Draft ready
                            </Text>
                          ) : (
                            <Text color="gray.500" fontSize="sm">
                              Not started
                            </Text>
                          )
                        )}
                      </Box>
                    </Td>
                    <Td>
                      <Flex gap={2}>
                        <Button
                          colorScheme={isGenerating && selectedInfluencer?.username === influencer.username ? "purple" : "blue"}
                          size="sm"
                          onClick={() => generateEmailDraft(influencer)}
                          isLoading={isGenerating && selectedInfluencer?.username === influencer.username}
                          loadingText="AI Generating"
                          bgGradient={isGenerating && selectedInfluencer?.username === influencer.username ? 
                            "linear(to-r, purple.500, blue.500)" : ""}
                        >
                          {isGenerating && selectedInfluencer?.username === influencer.username 
                            ? "AI Generating" 
                            : influencer.email_sent 
                              ? "Edit Email" 
                              : influencer.email_subject && influencer.email_body 
                                ? "View/Edit Draft" 
                                : "Generate Email"}
                        </Button>
                        
                        <Menu>
                          <MenuButton
                            as={IconButton}
                            aria-label="Options"
                            icon={<Text>⋮</Text>}
                            variant="ghost"
                            size="sm"
                          />
                          <MenuList>
                            <MenuItem 
                              onClick={() => updateInfluencerStatus(influencer.username, 'email_sent', !influencer.email_sent)}
                            >
                              {influencer.email_sent ? '❌ Mark Email Not Sent' : '✅ Mark Email Sent'}
                            </MenuItem>
                            <MenuItem 
                              onClick={() => updateInfluencerStatus(influencer.username, 'dm_sent', !influencer.dm_sent)}
                            >
                              {influencer.dm_sent ? '❌ Mark DM Not Sent' : '✅ Mark DM Sent'}
                            </MenuItem>
                            <MenuDivider />
                            <MenuItem 
                              onClick={() => updateInfluencerStatus(influencer.username, 'reset', false)}
                              color="red.500"
                            >
                              🔄 Reset All Statuses
                            </MenuItem>
                          </MenuList>
                        </Menu>
                      </Flex>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Box>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} size="xl">
        <ModalOverlay 
          bg="blackAlpha.300"
          backdropFilter="blur(10px)"
        />
        <ModalContent
          boxShadow={isGenerating ? "0 0 20px rgba(123, 104, 238, 0.4)" : "xl"}
          transition="box-shadow 0.3s ease"
          bg={isGenerating ? "rgba(15, 15, 30, 0.95)" : "white"}
          color={isGenerating ? "white" : "inherit"}
          borderRadius="xl"
          overflow="hidden"
          border={isGenerating ? "1px solid rgba(123, 104, 238, 0.3)" : "none"}
        >
          <Box 
            position="absolute" 
            top="0" 
            left="0" 
            right="0" 
            height="4px" 
            bgGradient="linear(to-r, blue.400, purple.500)" 
            display={(isGenerating || isRegenerating) ? "block" : "none"}
          />
          <ModalHeader>
            {isGenerating || isRegenerating ? (
              <Text bgGradient="linear(to-r, cyan.400, purple.500)" bgClip="text">
                AI Generating Email for {selectedInfluencer?.username}
              </Text>
            ) : selectedInfluencer?.email_sent ? (
              <>
                Editing Email for {selectedInfluencer?.username}
                <Text as="span" color="green.500" ml={2} fontSize="sm">
                  (Previously Sent)
                </Text>
              </>
            ) : (
              <>Email Draft for {selectedInfluencer?.username}</>
            )}
          </ModalHeader>
          <ModalCloseButton color={isGenerating ? "white" : "inherit"} />
          <ModalBody pb={6}>
            {isGenerating || isRegenerating ? (
              <Box py={10} textAlign="center">
                <Box 
                  mb={6}
                  position="relative"
                  width="150px" 
                  height="150px" 
                  margin="0 auto"
                >
                  {/* Background pulsing circle - using a new approach for centering */}
                  <Center
                    position="absolute"
                    left="0"
                    right="0"
                    top="0"
                    bottom="0"
                    margin="auto"
                  >
                    <Box
                      width="120px"
                      height="120px"
                      borderRadius="50%"
                      bgGradient="linear(to-r, cyan.300, purple.500)"
                      opacity="0.3"
                      style={{
                        animation: "pulse2 2s ease-in-out infinite"
                      }}
                    />
                  </Center>
                  
                  {/* Outer spinner */}
                  <Spinner
                    thickness="4px"
                    speed="0.75s"
                    emptyColor="gray.200"
                    color="purple.500"
                    size="xl"
                    position="absolute"
                    left="0"
                    right="0"
                    top="0"
                    bottom="0"
                    margin="auto"
                  />
                  
                  {/* Middle ring with spin animation */}
                  <Box
                    position="absolute"
                    left="50%"
                    top="50%"
                    transform="translate(-50%, -50%)"
                    width="75px"
                    height="75px"
                    borderRadius="50%"
                    border="3px dashed"
                    borderColor="cyan.400"
                    style={{
                      animation: "spin 10s linear infinite"
                    }}
                  />
                  
                  {/* Inner spinner */}
                  <Spinner
                    thickness="4px"
                    speed="0.5s"
                    emptyColor="gray.200"
                    color="blue.500"
                    size="md"
                    position="absolute"
                    left="0"
                    right="0"
                    top="0"
                    bottom="0"
                    margin="auto"
                  />
                  
                  {/* Center icon with subtle float animation */}
                  <Center
                    position="absolute"
                    left="0"
                    right="0"
                    top="0"
                    bottom="0"
                    margin="auto"
                    zIndex="2"
                  >
                    <Box
                      fontSize="2xl"
                      style={{
                        animation: "pulse2 2.5s ease-in-out infinite"
                      }}
                    >
                      <Text 
                        bgGradient="linear(to-l, #7928CA, #FF0080)" 
                        bgClip="text" 
                        fontWeight="bold">
                        AI
                      </Text>
                    </Box>
                  </Center>
                  
                  {/* Decorative elements with float animations */}
                  <Box
                    position="absolute"
                    right="10px"
                    top="30px"
                    fontSize="lg"
                    style={{
                      animation: "float1 3s ease-in-out infinite"
                    }}
                  >
                    ✨
                  </Box>
                  <Box
                    position="absolute"
                    left="10px"
                    bottom="30px"
                    fontSize="lg"
                    style={{
                      animation: "float2 3.5s ease-in-out infinite 0.5s"
                    }}
                  >
                    ✨
                  </Box>
                </Box>
                <Text 
                  fontWeight="bold" 
                  mb={2} 
                  bgGradient="linear(to-l, #7928CA, #FF0080)" 
                  bgClip="text"
                  fontSize="xl"
                >
                  AI is crafting your personalized email
                </Text>
                <Text color="gray.500" mb={3}>
                  Analyzing profile and generating content...
                </Text>
                <Box 
                  width="80%" 
                  mx="auto" 
                  height="6px" 
                  borderRadius="full" 
                  overflow="hidden" 
                  bgColor="gray.100"
                >
                  <Box 
                    height="100%" 
                    width="60%" 
                    bgGradient="linear(to-r, blue.300, purple.500)" 
                    borderRadius="full"
                    style={{
                      background: 'linear-gradient(to right, #7928CA, #FF0080, #7928CA)',
                      backgroundSize: '400% 100%',
                      animation: 'shimmer 3s infinite linear'
                    }}
                  />
                </Box>
              </Box>
            ) : (
              <>
                <Box mb={4}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Text fontWeight="bold">Subject:</Text>
                  </Box>
                  <input
                    value={emailDraft.subject}
                    onChange={(e) => setEmailDraft({...emailDraft, subject: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #E2E8F0',
                      borderRadius: '0.375rem',
                      fontSize: '1rem',
                      lineHeight: '1.5'
                    }}
                  />
                </Box>
                
                <Box mb={4}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Text fontWeight="bold">Body:</Text>
                    <Button
                      size="xs"
                      colorScheme="purple"
                      leftIcon={<span role="img" aria-label="regenerate">🔄</span>}
                      onClick={() => selectedInfluencer && generateEmailDraft(selectedInfluencer, true)}
                      isLoading={isRegenerating}
                      loadingText="Regenerating"
                    >
                      Regenerate with AI
                    </Button>
                  </Box>
                  <textarea
                    value={emailDraft.body}
                    onChange={(e) => setEmailDraft({...emailDraft, body: e.target.value})}
                    rows={10}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #E2E8F0',
                      borderRadius: '0.375rem',
                      fontSize: '1rem',
                      lineHeight: '1.5',
                      fontFamily: 'inherit'
                    }}
                  />
                  
                  {selectedInfluencer?.email_generated_at && !isRegenerating && (
                    <Text fontSize="xs" color="gray.500" mt={1} textAlign="right">
                      Generated {new Date(selectedInfluencer.email_generated_at).toLocaleString()}
                    </Text>
                  )}
                </Box>
                
                <Box display="flex" justifyContent="space-between" alignItems="center" mt={4}>
                  <Box display="flex" gap={2}>
                    <Button 
                      colorScheme={selectedInfluencer?.email_sent ? "green" : "blue"}
                      onClick={sendEmail} 
                      isLoading={isSending}
                      isDisabled={!selectedInfluencer?.email}
                      leftIcon={<span role="img" aria-label="send">{selectedInfluencer?.email_sent ? '🔄' : '📤'}</span>}
                    >
                      {selectedInfluencer?.email_sent ? 'Resend Email' : 'Send Email'}
                    </Button>
                    
                    <Button
                      colorScheme="purple"
                      variant="outline"
                      onClick={async () => {
                        // Save the draft first
                        if (selectedInfluencer) {
                          try {
                            setIsSendingDM(true);
                            const response = await fetch('/api/save-email-draft', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                username: selectedInfluencer.username,
                                subject: emailDraft.subject,
                                body: emailDraft.body
                              }),
                            });
                            
                            if (!response.ok) {
                              console.warn('Failed to save draft before sending DM');
                            }
                            
                            // Then send via Instagram DM
                            const dmResponse = await fetch('/api/send-instagram-dm', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                username: selectedInfluencer.username,
                                message: emailDraft.body,
                                influencer: selectedInfluencer
                              }),
                            });
                            
                            const result = await dmResponse.json();
                            
                            if (result.error) {
                              throw new Error(result.error);
                            }
                            
                            toast({
                              title: 'Success',
                              description: 'Instagram DM sent successfully',
                              status: 'success',
                              duration: 3000,
                            });
                            
                            // Update the local state to reflect the DM sent status
                            if (selectedInfluencer) {
                              setInfluencers(prevInfluencers => 
                                prevInfluencers.map(inf => 
                                  inf.username === selectedInfluencer.username 
                                    ? {...inf, dm_sent: true, dm_sent_at: new Date().toISOString(), dm_message: emailDraft.body}
                                    : inf
                                )
                              );
                            }
                            
                            // Close the modal after sending
                            setIsModalOpen(false);
                          } catch (error) {
                            toast({
                              title: 'Error',
                              description: error instanceof Error ? error.message : 'Failed to send Instagram DM',
                              status: 'error',
                              duration: 3000,
                            });
                          } finally {
                            setIsSendingDM(false);
                          }
                        }
                      }}
                      isLoading={isSendingDM}
                      loadingText="Sending DM"
                      leftIcon={<span role="img" aria-label="instagram">📱</span>}
                    >
                      Send via Instagram DM
                    </Button>
                    
                    <Button
                      colorScheme="gray"
                      variant="outline"
                      onClick={async () => {
                        if (selectedInfluencer) {
                          try {
                            const response = await fetch('/api/save-email-draft', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                username: selectedInfluencer.username,
                                subject: emailDraft.subject,
                                body: emailDraft.body
                              }),
                            });
                            
                            if (response.ok) {
                              toast({
                                title: 'Draft Saved',
                                description: 'Your email draft has been saved',
                                status: 'success',
                                duration: 2000,
                              });
                              
                              // Update the local state
                              const now = new Date().toISOString();
                              
                              // Update selected influencer
                              setSelectedInfluencer({
                                ...selectedInfluencer,
                                email_subject: emailDraft.subject,
                                email_body: emailDraft.body,
                                email_generated_at: now
                              });
                              
                              // Update the influencer in the table list
                              setInfluencers(prevInfluencers => 
                                prevInfluencers.map(inf => 
                                  inf.username === selectedInfluencer.username 
                                    ? {
                                        ...inf, 
                                        email_subject: emailDraft.subject,
                                        email_body: emailDraft.body,
                                        email_generated_at: now
                                      }
                                    : inf
                                )
                              );
                            } else {
                              throw new Error('Failed to save draft');
                            }
                          } catch (error) {
                            toast({
                              title: 'Error',
                              description: 'Failed to save draft',
                              status: 'error',
                              duration: 3000,
                            });
                          }
                        }
                      }}
                      leftIcon={<span role="img" aria-label="save">💾</span>}
                    >
                      Save Draft
                    </Button>
                  </Box>
                  
                  <Box>
                    {!!selectedInfluencer?.email_sent && (
                      <Box p={2} bg="green.50" borderRadius="md" borderLeft="3px solid" borderColor="green.500" mb={2}>
                        <Text color="green.600" fontWeight="medium" fontSize="sm">
                          Email was sent on {selectedInfluencer.email_sent_at ? 
                            new Date(selectedInfluencer.email_sent_at as string).toLocaleString() : 
                            'unknown date'
                          }
                        </Text>
                        <Text color="green.500" fontSize="xs" mt={1}>
                          You can edit and resend the email if needed
                        </Text>
                      </Box>
                    )}
                    
                    {!!selectedInfluencer?.dm_sent && (
                      <Box p={2} bg="purple.50" borderRadius="md" borderLeft="3px solid" borderColor="purple.500">
                        <Text color="purple.600" fontWeight="medium" fontSize="sm">
                          Instagram DM was sent on {selectedInfluencer.dm_sent_at ? 
                            new Date(selectedInfluencer.dm_sent_at as string).toLocaleString() : 
                            'unknown date'
                          }
                        </Text>
                        <Text color="purple.500" fontSize="xs" mt={1}>
                          You can send another DM if needed
                        </Text>
                      </Box>
                    )}
                  </Box>
                </Box>
              </>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
      
      {/* Reset Database Modal */}
      <Modal isOpen={isResetModalOpen} onClose={() => !isResetting && setIsResetModalOpen(false)} isCentered>
        <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
        <ModalContent maxWidth="500px" p={4}>
          <ModalHeader color="red.500">Reset Database</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <Text fontWeight="bold" mb={4}>
              Warning: This will permanently delete ALL data from the database!
            </Text>
            <Text mb={4}>
              This action will remove all influencer data, including:
            </Text>
            <Box p={3} bg="gray.50" borderRadius="md" mb={4}>
              <Text>• All influencer profiles</Text>
              <Text>• All extracted emails</Text>
              <Text>• All generated email drafts</Text>
              <Text>• All outreach history and sent emails</Text>
              <Text>• All cached hashtags and search results</Text>
            </Box>
            <Text fontWeight="bold" mb={4}>
              This action cannot be undone. Are you sure you want to continue?
            </Text>
            
            <Box display="flex" justifyContent="space-between" mt={6}>
              <Button 
                variant="outline" 
                onClick={() => setIsResetModalOpen(false)}
                isDisabled={isResetting}
              >
                Cancel
              </Button>
              <Button 
                colorScheme="red" 
                onClick={resetDatabase}
                isLoading={isResetting}
                loadingText="Resetting..."
                leftIcon={<span role="img" aria-label="warning">⚠️</span>}
              >
                Yes, Delete All Data
              </Button>
            </Box>
          </ModalBody>
        </ModalContent>
      </Modal>
      
      {/* Outreach Modal */}
      <Modal 
        isOpen={isOutreachModalOpen} 
        onClose={() => !isRunningOutreach && setIsOutreachModalOpen(false)} 
        size="xl"
      >
        <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
        <ModalContent
          maxWidth="800px"
          minHeight="500px"
          boxShadow="xl"
          borderRadius="xl"
        >
          <ModalHeader display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Heading size="lg">Find New Influencers</Heading>
              <Text fontSize="sm" color="gray.500" mt={1}>
                This will search Instagram hashtags for new influencers and add them to your database
              </Text>
            </Box>
            {!isRunningOutreach && (
              <ModalCloseButton position="static" />
            )}
          </ModalHeader>
          
          <ModalBody pb={6}>
            {/* Add a new transitional state for when process is initializing */}
            {outreachLogs.length > 0 && !isRunningOutreach && !currentStage ? (
              <Box>
                <Text mb={4}>
                  This process will:
                </Text>
                <Box pl={4} mb={6}>
                  <Text>1. Search Instagram hashtags for relevant posts</Text>
                  <Text>2. Extract usernames of content creators</Text>
                  <Text>3. Fetch profile information for each username</Text>
                  <Text>4. Extract emails from user bios</Text>
                  <Text>5. Verify if users are influencers by checking view counts</Text>
                </Box>
                
                <Box 
                  p={4} 
                  bg="blue.50" 
                  borderRadius="md" 
                  borderLeft="4px solid" 
                  borderColor="blue.500" 
                  mb={6}
                  display="flex"
                  alignItems="center"
                >
                  <Spinner size="sm" color="blue.500" mr={3} />
                  <Box>
                    <Text fontWeight="bold" color="blue.700">Initializing Process</Text>
                    <Text fontSize="sm" color="blue.600">
                      Starting the outreach process, please wait...
                    </Text>
                  </Box>
                </Box>
                
                <Box 
                  maxHeight="150px" 
                  overflowY="auto" 
                  p={3} 
                  borderRadius="md" 
                  bg="gray.50"
                  border="1px solid"
                  borderColor="gray.200"
                  fontFamily="mono"
                  fontSize="xs"
                  mb={4}
                >
                  {outreachLogs.map((log, index) => (
                    <Text key={index} mb={1}>
                      {log}
                    </Text>
                  ))}
                  <div ref={logsEndRef} />
                </Box>
              </Box>
            ) : !isRunningOutreach ? (
              <Box>
                <Text mb={4}>
                  This process will:
                </Text>
                <Box pl={4} mb={6}>
                  <Text>1. Search Instagram hashtags for relevant posts</Text>
                  <Text>2. Extract usernames of content creators</Text>
                  <Text>3. Fetch profile information for each username</Text>
                  <Text>4. Extract emails from user bios</Text>
                  <Text>5. Verify if users are influencers by checking view counts</Text>
                </Box>
                
                <Text fontSize="sm" color="gray.500" mb={6}>
                  This process will take several minutes to complete as it needs to navigate to Instagram
                  and analyze profiles. You can close this modal and come back later - the process will
                  continue running in the background.
                </Text>
                
                <Button
                  colorScheme="purple"
                  size="lg"
                  width="100%"
                  height="60px"
                  onClick={runOutreach}
                >
                  Start Finding New Influencers
                </Button>
              </Box>
            ) : (
              <Box>
                {/* Current status display */}
                <Box mb={6}>
                  <Text fontWeight="bold" mb={2}>Current Progress:</Text>
                  
                  {currentStage === 'error' ? (
                    <Box p={4} bg="red.50" borderRadius="md" borderLeft="4px solid" borderColor="red.500" mb={4}>
                      <Flex alignItems="center">
                        <Box color="red.500" fontSize="xl" mr={2}>⚠️</Box>
                        <Text fontWeight="bold" color="red.700">Process Failed</Text>
                      </Flex>
                      <Text mt={2} color="red.600">
                        {progressUpdates.length > 0 && progressUpdates[progressUpdates.length - 1].stage === 'error'
                          ? progressUpdates[progressUpdates.length - 1].message 
                          : 'An error occurred during the outreach process'}
                      </Text>
                    </Box>
                  ) : currentStage === 'stopped' ? (
                    <Box p={4} bg="yellow.50" borderRadius="md" borderLeft="4px solid" borderColor="yellow.500" mb={4}>
                      <Flex alignItems="center">
                        <Box color="yellow.500" fontSize="xl" mr={2}>⏹️</Box>
                        <Text fontWeight="bold" color="yellow.700">Process Stopped</Text>
                      </Flex>
                      <Text mt={2} color="yellow.600">
                        The outreach process was manually stopped
                      </Text>
                    </Box>
                  ) : currentStage === 'complete' ? (
                    <Box p={4} bg="green.50" borderRadius="md" borderLeft="4px solid" borderColor="green.500" mb={4}>
                      <Flex alignItems="center">
                        <Box color="green.500" fontSize="xl" mr={2}>✅</Box>
                        <Text fontWeight="bold" color="green.700">Process Completed Successfully</Text>
                      </Flex>
                      <Text mt={2} color="green.600">
                        {progressUpdates.length > 0 && progressUpdates[progressUpdates.length - 1].stage === 'complete'
                          ? progressUpdates[progressUpdates.length - 1].message
                          : 'Outreach process completed successfully'}
                      </Text>
                      
                      {/* Get influencer stats from progress updates */}
                      {progressUpdates.length > 0 && progressUpdates.some(update => update.stage === 'complete' && update.data?.influencer_count) && (
                        <Box mt={3} pt={3} borderTop="1px solid" borderColor="green.200">
                          <Text fontSize="sm" fontWeight="bold" color="green.700">Summary:</Text>
                          <Text fontSize="sm" color="green.600" mt={1}>
                            Found {progressUpdates.find(update => update.stage === 'complete')?.data?.influencer_count || 0} influencers in total
                          </Text>
                          
                          <Button 
                            mt={3}
                            size="sm"
                            colorScheme="green"
                            leftIcon={<span role="img" aria-label="refresh">🔄</span>}
                            onClick={() => fetchInfluencersWithLoading()}
                          >
                            Refresh Influencer List
                          </Button>
                        </Box>
                      )}
                    </Box>
                  ) : (
                    <>
                      <Progress 
                        value={getProgressPercentage()} 
                        size="lg" 
                        colorScheme={currentStage ? getStageColor(currentStage) : 'gray'}
                        borderRadius="md"
                        hasStripe
                        isAnimated
                        mb={2}
                      />
                      
                      <Flex justifyContent="space-between" fontSize="sm" color="gray.600">
                        <Text>Search Hashtags</Text>
                        <Text>Get Profiles</Text>
                        <Text>Extract Emails</Text>
                        <Text>Process Users</Text>
                      </Flex>
                    </>
                  )}
                  
                  {currentStage && (
                    <Badge colorScheme={getStageColor(currentStage)} mt={4} p={2} borderRadius="md">
                      {currentStage.charAt(0).toUpperCase() + currentStage.slice(1)}
                    </Badge>
                  )}
                </Box>
                
                <Box mb={4}>
                  <Text fontWeight="bold" mb={2}>Activity Log:</Text>
                  <Box 
                    maxHeight="250px" 
                    overflowY="auto" 
                    p={3} 
                    borderRadius="md" 
                    bg="gray.50"
                    border="1px solid"
                    borderColor="gray.200"
                    fontFamily="mono"
                    fontSize="xs"
                  >
                    {outreachLogs.length > 0 ? (
                      outreachLogs.map((log, index) => (
                        <Text key={index} mb={1}>
                          {log}
                        </Text>
                      ))
                    ) : (
                      <Text color="gray.500">Waiting for process to start...</Text>
                    )}
                    <div ref={logsEndRef} />
                  </Box>
                </Box>
                
                {/* Progress Details Accordion */}
                <Accordion allowToggle mb={6}>
                  <AccordionItem>
                    <h2>
                      <AccordionButton>
                        <Box flex="1" textAlign="left">
                          <Text fontWeight="bold">Progress Details</Text>
                        </Box>
                        <AccordionIcon />
                      </AccordionButton>
                    </h2>
                    <AccordionPanel>
                      <Stack spacing={3} mt={2}>
                        {progressUpdates.length > 0 ? (
                          progressUpdates.map((update, index) => (
                            <Box key={index} p={2} borderRadius="md" bg={`${getStageColor(update.stage)}.50`} borderLeft="3px solid" borderColor={`${getStageColor(update.stage)}.500`}>
                              <Text fontWeight="bold" fontSize="sm">
                                {update.stage.charAt(0).toUpperCase() + update.stage.slice(1)}
                              </Text>
                              <Text fontSize="sm">{update.message}</Text>
                              {update.data && Object.keys(update.data).length > 0 && (
                                <Code fontSize="xs" mt={1} p={1}>
                                  {JSON.stringify(update.data, null, 2)}
                                </Code>
                              )}
                            </Box>
                          ))
                        ) : (
                          <Text color="gray.500">No progress updates yet</Text>
                        )}
                      </Stack>
                    </AccordionPanel>
                  </AccordionItem>
                </Accordion>
                
                {currentStage === 'error' || currentStage === 'complete' || currentStage === 'stopped' ? (
                  <Button
                    colorScheme={currentStage === 'complete' ? "green" : "blue"}
                    width="100%"
                    leftIcon={currentStage === 'complete' ? <span role="img" aria-label="checkmark">✓</span> : undefined}
                    onClick={() => {
                      // Reset states
                      setOutreachLogs([]);
                      setProgressUpdates([]);
                      setCurrentStage(null);
                      setIsRunningOutreach(false);
                      setStoppedNotificationShown(false); // Reset notification state
                      
                      // Close the modal
                      setIsOutreachModalOpen(false);
                      
                      // Show a toast when not completing successfully (already showed a success toast)
                      if (currentStage !== 'complete') {
                        toast({
                          title: 'Ready',
                          description: 'You can start a new outreach process when needed',
                          status: 'info',
                          duration: 3000,
                        });
                      }
                    }}
                  >
                    {currentStage === 'complete' ? 'Done - View Influencers' : 'Close'}
                  </Button>
                ) : (
                  <Button
                    colorScheme="red"
                    variant="outline"
                    width="100%"
                    onClick={stopOutreach}
                  >
                    Stop Process
                  </Button>
                )}
              </Box>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
      
      {/* YOLO Modal */}
      <Modal 
        isOpen={isYoloModalOpen} 
        onClose={() => !isRunningYolo && setIsYoloModalOpen(false)} 
        size="xl"
      >
        <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
        <ModalContent
          maxWidth="800px"
          minHeight="500px"
          boxShadow="xl"
          borderRadius="xl"
        >
          <ModalHeader display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Heading size="lg" bgGradient="linear(to-r, green.400, teal.500)" bgClip="text">
                YOLO - Automated Outreach
              </Heading>
              <Text fontSize="sm" color="gray.500" mt={1}>
                Automatically find influencers and send personalized outreach via email or Instagram DM
              </Text>
            </Box>
            {!isRunningYolo && (
              <ModalCloseButton position="static" />
            )}
          </ModalHeader>
          
          <ModalBody pb={6}>
            {!isRunningYolo && yoloLogs.length === 0 ? (
              <Box>
                <Text mb={4} fontWeight="bold">
                  This automated process will:
                </Text>
                <Box pl={4} mb={6}>
                  <Text mb={2}>🔍 1. Search for new influencers from hashtags</Text>
                  <Text mb={2}>👤 2. Fetch their profile information</Text>
                  <Text mb={2}>✉️ 3. Extract email addresses from bios</Text>
                  <Text mb={2}>🎯 4. Verify influencer status (view counts)</Text>
                  <Text mb={2}>🤖 5. Generate personalized messages using AI</Text>
                  <Text mb={2}>📤 6. Send outreach via email (if available) or Instagram DM</Text>
                </Box>
                
                <Box 
                  p={4} 
                  bg="orange.50" 
                  borderRadius="md" 
                  borderLeft="4px solid" 
                  borderColor="orange.500" 
                  mb={6}
                >
                  <Text fontWeight="bold" color="orange.700">⚠️ Important:</Text>
                  <Text fontSize="sm" color="orange.600" mt={1}>
                    This process runs automatically and will send messages to influencers without manual review. 
                    Make sure your message templates and settings are configured correctly.
                  </Text>
                </Box>
                
                <Button
                  colorScheme="green"
                  size="lg"
                  width="100%"
                  height="60px"
                  onClick={runYolo}
                  leftIcon={<span role="img" aria-label="rocket">🚀</span>}
                  bgGradient="linear(to-r, green.400, teal.500)"
                  _hover={{
                    bgGradient: "linear(to-r, green.500, teal.600)",
                  }}
                >
                  Start YOLO Process
                </Button>
              </Box>
            ) : (
              <Box>
                {/* Progress display */}
                {yoloProgress && (
                  <Box mb={6}>
                    <Text fontWeight="bold" mb={2}>Current Progress:</Text>
                    
                    {yoloProgress.percent && (
                      <Progress 
                        value={yoloProgress.percent} 
                        size="lg" 
                        colorScheme="green"
                        borderRadius="md"
                        hasStripe
                        isAnimated
                        mb={4}
                      />
                    )}
                    
                    {yoloProgress.stage && (
                      <Badge 
                        colorScheme={
                          yoloProgress.stage === 'complete' ? 'green' : 
                          yoloProgress.stage === 'error' ? 'red' : 
                          'blue'
                        } 
                        p={2} 
                        borderRadius="md"
                      >
                        {yoloProgress.stage.charAt(0).toUpperCase() + yoloProgress.stage.slice(1)}
                      </Badge>
                    )}
                    
                    {yoloProgress.data && (
                      <Box mt={3} p={3} bg="gray.50" borderRadius="md">
                        <Text fontSize="sm" fontWeight="bold">Details:</Text>
                        <Code fontSize="xs" mt={1}>
                          {JSON.stringify(yoloProgress.data, null, 2)}
                        </Code>
                      </Box>
                    )}
                  </Box>
                )}
                
                {/* Activity logs */}
                <Box mb={4}>
                  <Text fontWeight="bold" mb={2}>Activity Log:</Text>
                  <Box 
                    maxHeight="300px" 
                    overflowY="auto" 
                    p={3} 
                    borderRadius="md" 
                    bg="gray.50"
                    border="1px solid"
                    borderColor="gray.200"
                    fontFamily="mono"
                    fontSize="xs"
                  >
                    {yoloLogs.length > 0 ? (
                      yoloLogs.map((log, index) => (
                        <Text key={index} mb={1}>
                          {log}
                        </Text>
                      ))
                    ) : (
                      <Text color="gray.500">Waiting for process to start...</Text>
                    )}
                    <div ref={yoloLogsEndRef} />
                  </Box>
                </Box>
                
                {/* Action buttons */}
                {yoloProgress?.stage === 'complete' || yoloProgress?.stage === 'error' ? (
                  <Button
                    colorScheme={yoloProgress.stage === 'complete' ? "green" : "blue"}
                    width="100%"
                    onClick={() => {
                      setYoloLogs([]);
                      setYoloProgress(null);
                      setIsRunningYolo(false);
                      setIsYoloModalOpen(false);
                    }}
                  >
                    {yoloProgress.stage === 'complete' ? 'Done - View Results' : 'Close'}
                  </Button>
                ) : (
                  <Button
                    colorScheme="red"
                    variant="outline"
                    width="100%"
                    onClick={stopYolo}
                    isDisabled={!isRunningYolo}
                  >
                    Stop YOLO Process
                  </Button>
                )}
              </Box>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Container>
  );
}