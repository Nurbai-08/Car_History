import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@/entities';
import { api, refresh, setAccessToken, setExpiredHandler, queryClient } from '@/shared/api';
const Context = createContext<{
  user: User | null;
  ready: boolean;
  setUser: (u: User | null) => void;
  login: (data: any) => void;
  logout: () => Promise<void>;
}>(null!);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false);
  useEffect(() => {
    setExpiredHandler(() => setUser(null));
    refresh()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);
  return (
    <Context.Provider
      value={{
        user,
        ready,
        setUser,
        login: (data) => {
          setAccessToken(data.accessToken);
          queryClient.clear();
          setUser(data.user);
        },
        logout: async () => {
          await api.post('/auth/logout');
          setAccessToken(null);
          queryClient.clear();
          setUser(null);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useSession = () => useContext(Context);
