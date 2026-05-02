import { create } from "zustand";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

type State = {
  online: boolean;
  type: NetInfoState["type"] | null;
  init: () => () => void;
};

export const useNetwork = create<State>((set) => ({
  online: true,
  type: null,
  init: () => {
    const sub = NetInfo.addEventListener((state) => {
      set({ online: !!state.isConnected, type: state.type });
    });
    return sub;
  },
}));
