"use client";

import { create } from "zustand";
import type { AdminPermission } from "@/lib/admin-permissions";

export type LocalUser = {
    id: string;
    accountId: string;
    username: string;
    email?: string;
    displayName: string;
    bio: string;
    avatarUrl?: string;
    role: "admin" | "user";
    adminPermissions: AdminPermission[];
    status: "active" | "disabled";
    planId: string;
    planName: string;
    hasActivePlan: boolean;
    pointsBalance: number;
    permanentPointsBalance?: number;
    dailyPointsBalance?: number;
    dailyPointsExpiresAt?: string;
    mfaEnabled: boolean;
};

// The static build uses this internal identity only to partition local data.
// It is never shown as an account and is never sent to New API.
export const STATIC_LOCAL_USER: LocalUser = {
    id: "static-local",
    accountId: "static-local",
    username: "local-workspace",
    displayName: "本地工作台",
    bio: "",
    role: "user",
    adminPermissions: [],
    status: "active",
    planId: "local",
    planName: "static",
    hasActivePlan: true,
    pointsBalance: 0,
    mfaEnabled: false,
};

type UserStore = {
    user: LocalUser | null;
    setUser: (user: LocalUser | null) => void;
    clearSession: () => void;
};

export const useUserStore = create<UserStore>()((set) => ({
    user: null,
    setUser: (user) => set({ user }),
    clearSession: () => set({ user: null }),
}));
