import './App.css';

import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Section,
} from '@radix-ui/themes';

import { postFoo } from './client/sdk.gen';

function App() {
  const onClick = async () => {
    postFoo({
      body: 'foo',
    });
  };

  return (
    <Box
      style={{ background: 'var(--gray-a2)', borderRadius: 'var(--radius-3)' }}
    >
      <Container size="1">
        <Section size="1" />
        <Flex align="center">
          <Heading>sample for internal testing</Heading>
        </Flex>
        <Section size="1" />
        <Flex direction="column" gapY="2">
          <Button onClick={onClick}>Click me</Button>
        </Flex>
        <Section size="1" />
      </Container>
    </Box>
  );
}

export default App;
