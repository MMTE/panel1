import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  productId: string;
  productName: string;
  planId: string;
  planName: string;
  basePrice: string;
  setupFee: string;
  interval: string;
}

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
  getTotal: () => { baseTotal: number; setupTotal: number };
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) => {
        set((state) => {
          // Remove any existing item with same productId before adding new one
          const filteredItems = state.items.filter((i) => i.productId !== item.productId);
          return { items: [...filteredItems, item] };
        });
      },
      removeItem: (productId) => {
        set((state) => ({
          items: state.items.filter((item) => item.productId !== productId),
        }));
      },
      clearCart: () => set({ items: [] }),
      getTotal: () => {
        const items = get().items;
        return items.reduce(
          (acc, item) => ({
            baseTotal: acc.baseTotal + parseFloat(item.basePrice),
            setupTotal: acc.setupTotal + parseFloat(item.setupFee),
          }),
          { baseTotal: 0, setupTotal: 0 }
        );
      },
    }),
    {
      name: 'panel1-cart',
    }
  )
); 