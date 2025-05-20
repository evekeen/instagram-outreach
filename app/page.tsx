'use client';

import { Box, Button, Container, Heading, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay, Table, Tbody, Td, Text, Th, Thead, Tr, useToast } from '@chakra-ui/react';
import { useState } from 'react';
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

  return (
    <Container maxW="container.xl" py={8}>
      <Heading mb={6}>Influencer Manager</Heading>
      <Button onClick={fetchInfluencers} mb={4}>Load Influencers</Button>
      
      <Box overflowX="auto">
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
      </Box>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Email Draft for {selectedInfluencer?.username}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <Text fontWeight="bold" mb={2}>Subject:</Text>
            <Text mb={4}>{emailDraft.subject}</Text>
            <Text fontWeight="bold" mb={2}>Body:</Text>
            <Text whiteSpace="pre-wrap">{emailDraft.body}</Text>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Container>
  );
}