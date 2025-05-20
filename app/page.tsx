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

  const generateEmailDraft = async (influencer: Influencer): Promise<void> => {
    try {
      const response = await fetch('/api/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ influencer }),
      });
      const data = await response.json() as EmailDraft;
      setEmailDraft(data);
      setSelectedInfluencer(influencer);
      setIsModalOpen(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate email draft',
        status: 'error',
        duration: 3000,
      });
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
                      <Button
                        colorScheme="blue"
                        size="sm"
                        onClick={() => generateEmailDraft(influencer)}
                      >
                        Generate Email
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
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Email Draft for {selectedInfluencer?.username}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <Text fontWeight="bold" mb={2}>Subject:</Text>
            <Text mb={4}>{emailDraft.subject}</Text>
            <Text fontWeight="bold" mb={2}>Body:</Text>
            <Text whiteSpace="pre-wrap" mb={6}>{emailDraft.body}</Text>
            
            <Box display="flex" justifyContent="space-between" mt={4}>
              <Button 
                colorScheme="blue" 
                onClick={sendEmail} 
                isLoading={isSending}
                isDisabled={!selectedInfluencer?.email}
                leftIcon={<span role="img" aria-label="send">📤</span>}
              >
                Send Email
              </Button>
              
              {!selectedInfluencer?.email && (
                <Text color="red.500" fontSize="sm">
                  No email address available for this influencer
                </Text>
              )}
            </Box>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Container>
  );
}