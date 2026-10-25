import { useEffect, useState } from 'react';
import { Landing } from './components/Landing';
import { TablePage } from './components/TablePage';
import { Toasts } from './components/ui';

const roomFromPath = () => location.pathname.match(/^\/t\/([A-Za-z0-9_-]{8,64})\/?$/)?.[1] ?? null;

export default function App() {
  const [room, setRoom] = useState<string | null>(roomFromPath());
  useEffect(() => {
    const f = () => setRoom(roomFromPath());
    addEventListener('popstate', f);
    return () => removeEventListener('popstate', f);
  }, []);
  const open = (id: string) => { history.pushState(null, '', '/t/' + id); setRoom(id); };
  return (
    <>
      {room ? <TablePage roomId={room} key={room} /> : <Landing onCreated={open} />}
      <Toasts />
    </>
  );
}
