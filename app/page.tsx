'use client';

import { Box, Button, Container, Heading, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay, Table, Tbody, Td, Text, Th, Thead, Tr, useToast, Spinner, Center } from '@chakra-ui/react';
import { useState, useEffect } from 'react';
import { Influencer } from './lib/db';

interface EmailDraft {
  subject: string;
  body: string;
}

export default function Home() {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [emailDraft, setEmailDraft] = useState<EmailDraft>({ subject: '', body: '' });
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const toast = useToast();

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

  // Override fetchInfluencers to handle loading state
  const fetchInfluencersWithLoading = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await fetchInfluencers();
    } finally {
      setIsLoading(false);
    }
  };

  // Replace the useEffect to use the new function
  useEffect(() => {
    fetchInfluencersWithLoading();
  }, []);

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
      
      <Heading mb={6}>Influencer Manager</Heading>
      
      {isLoading ? (
        <Center py={10}>
          <Spinner size="xl" thickness="4px" speed="0.65s" color="blue.500" />
        </Center>
      ) : (
        <Box overflowX="auto">
          {influencers.length === 0 ? (
            <Center py={10}>
              <Text fontSize="lg">No influencers found</Text>
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
                {influencers.map((influencer) => (
                  <Tr key={influencer.username}>
                    <Td>{influencer.username}</Td>
                    <Td>{influencer.full_name}</Td>
                    <Td>{influencer.email}</Td>
                    <Td>
                      {influencer.email_sent ? (
                        <Text color="green.500" fontWeight="bold">
                          ✓ Sent
                        </Text>
                      ) : influencer.email_subject && influencer.email_body ? (
                        <Text color="blue.500">
                          Draft ready
                        </Text>
                      ) : (
                        <Text color="gray.500">
                          Not started
                        </Text>
                      )}
                    </Td>
                    <Td>
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
                    {!selectedInfluencer?.email && (
                      <Text color="red.500" fontSize="sm">
                        No email address available for this influencer
                      </Text>
                    )}
                    
                    {selectedInfluencer?.email_sent && (
                      <Box p={2} bg="green.50" borderRadius="md" borderLeft="3px solid" borderColor="green.500">
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
                  </Box>
                </Box>
              </>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Container>
  );
}