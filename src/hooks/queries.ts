/** TanStack Query hooks — the single place server state is fetched. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Conflict, SchedulingRule } from '@shared/conflicts';
import type {
  AdminUser,
  Assignment,
  AssignmentType,
  Availability,
  AuditEvent,
  Notification,
  Personnel,
  Qualification,
  ReplacementRequest,
  Schedule,
  Severity,
  Unit,
} from '@shared/types';
import { api } from '@/lib/api';

export const queryKeys = {
  dashboard: ['dashboard'] as const,
  personnel: (filters?: Record<string, string | undefined>) => ['personnel', filters] as const,
  units: ['units'] as const,
  qualifications: ['qualifications'] as const,
  assignmentTypes: ['assignment-types'] as const,
  assignments: (window: { from: number; to: number; unitId?: string }) =>
    ['assignments', window] as const,
  availability: (window: { from?: number; to?: number; status?: string }) =>
    ['availability', window] as const,
  conflicts: (window: { from: number; to: number }) => ['conflicts', window] as const,
  schedules: ['schedules'] as const,
  schedule: (id: string) => ['schedule', id] as const,
  notifications: ['notifications'] as const,
  replacements: ['replacements'] as const,
  audit: (filters: Record<string, string | number | undefined>) => ['audit', filters] as const,
  rules: ['rules'] as const,
  workload: (window: { from: number; to: number }) => ['workload', window] as const,
  mySchedule: ['my-schedule'] as const,
  candidates: (assignmentId: string) => ['candidates', assignmentId] as const,
  users: ['users'] as const,
};

export interface DashboardData {
  date: string;
  timezone: string;
  stats: {
    availableCount: number;
    unavailableCount: number;
    assignedCount: number;
    personnelCount: number;
    understaffedCount: number;
    unpublishedCount: number;
  };
  conflictSummary: Record<Severity, number>;
  upcoming: Assignment[];
  conflicts: Conflict[];
  recentChanges: {
    id: string;
    actorName: string;
    action: string;
    entityType: string;
    entityId: string;
    createdAt: number;
  }[];
}

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => api.get<DashboardData>('/dashboard'),
    refetchInterval: 60_000,
  });
}

export function usePersonnel(filters: Record<string, string | undefined> = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.personnel(filters),
    queryFn: () => api.get<{ personnel: Personnel[] }>('/personnel', filters),
    select: (data) => data.personnel,
    enabled,
  });
}

export function useUnits() {
  return useQuery({
    queryKey: queryKeys.units,
    queryFn: () => api.get<{ units: Unit[] }>('/units'),
    select: (data) => data.units,
    staleTime: 300_000,
  });
}

export function useQualifications() {
  return useQuery({
    queryKey: queryKeys.qualifications,
    queryFn: () => api.get<{ qualifications: Qualification[] }>('/qualifications'),
    select: (data) => data.qualifications,
    staleTime: 300_000,
  });
}

export function useAssignmentTypes() {
  return useQuery({
    queryKey: queryKeys.assignmentTypes,
    queryFn: () => api.get<{ assignmentTypes: AssignmentType[] }>('/assignment-types'),
    select: (data) => data.assignmentTypes,
    staleTime: 300_000,
  });
}

export interface AssignmentsResponse {
  assignments: Assignment[];
  conflicts: Conflict[];
  timezone: string;
  window: { from: number; to: number };
}

export function useAssignments(window: { from: number; to: number; unitId?: string }) {
  return useQuery({
    queryKey: queryKeys.assignments(window),
    queryFn: () =>
      api.get<AssignmentsResponse>('/assignments', {
        from: window.from,
        to: window.to,
        unitId: window.unitId,
      }),
    refetchInterval: 45_000,
  });
}

export function useAvailability(window: { from?: number; to?: number; status?: string }) {
  return useQuery({
    queryKey: queryKeys.availability(window),
    queryFn: () => api.get<{ availability: Availability[] }>('/availability', window),
    select: (data) => data.availability,
  });
}

export function useConflicts(window: { from: number; to: number }) {
  return useQuery({
    queryKey: queryKeys.conflicts(window),
    queryFn: () =>
      api.get<{ conflicts: Conflict[]; summary: Record<Severity, number> }>('/conflicts', window),
  });
}

export function useSchedules() {
  return useQuery({
    queryKey: queryKeys.schedules,
    queryFn: () => api.get<{ schedules: Schedule[] }>('/schedules'),
    select: (data) => data.schedules,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () =>
      api.get<{ notifications: Notification[]; unreadCount: number }>('/notifications'),
    refetchInterval: 60_000,
  });
}

export function useReplacements(status?: string) {
  return useQuery({
    queryKey: [...queryKeys.replacements, status] as const,
    queryFn: () => api.get<{ replacements: ReplacementRequest[] }>('/replacements', { status }),
    select: (data) => data.replacements,
  });
}

export function useAuditEvents(filters: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: queryKeys.audit(filters),
    queryFn: () => api.get<{ events: AuditEvent[] }>('/audit', filters),
    select: (data) => data.events,
  });
}

export function useUsers(enabled = true) {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: () => api.get<{ users: AdminUser[] }>('/users'),
    select: (data) => data.users,
    enabled,
  });
}

export function useRules() {
  return useQuery({
    queryKey: queryKeys.rules,
    queryFn: () => api.get<{ rules: SchedulingRule[] }>('/rules'),
    select: (data) => data.rules,
  });
}

export interface WorkloadRow {
  personnelId: string;
  displayName: string;
  unitName: string | null;
  totalHours: number;
  nightHours: number;
  weekendHours: number;
  assignmentCount: number;
  score: number;
}

export function useWorkloadReport(window: { from: number; to: number }) {
  return useQuery({
    queryKey: queryKeys.workload(window),
    queryFn: () =>
      api.get<{
        workload: WorkloadRow[];
        staffingGaps: {
          assignmentId: string;
          title: string;
          startAt: number;
          endAt: number;
          missing: number;
        }[];
        timezone: string;
      }>('/reports/workload', window),
  });
}

export function useMySchedule() {
  return useQuery({
    queryKey: queryKeys.mySchedule,
    queryFn: () =>
      api.get<{
        personnelId: string;
        timezone: string;
        assignments: Assignment[];
        availability: Availability[];
      }>('/me/schedule'),
  });
}

/** Invalidate everything that depends on the schedule after a write. */
export function useScheduleInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [
      'assignments',
      'conflicts',
      'dashboard',
      'schedule',
      'my-schedule',
      'workload',
      'candidates',
    ]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
}

export function useAssignPersonnel() {
  const invalidate = useScheduleInvalidation();
  return useMutation({
    mutationFn: (input: {
      assignmentId: string;
      personnelId: string;
      /** Named seat to fill, or null for a plain לוחם seat. */
      role?: string | null;
      overrideReason?: string;
    }) =>
      api.post<{ conflicts: Conflict[]; overridden: boolean }>(
        `/assignments/${input.assignmentId}/assign`,
        {
          personnelId: input.personnelId,
          role: input.role ?? null,
          ...(input.overrideReason ? { overrideReason: input.overrideReason } : {}),
        },
      ),
    onSuccess: invalidate,
  });
}

export function useUnassignPersonnel() {
  const invalidate = useScheduleInvalidation();
  return useMutation({
    mutationFn: (input: { assignmentId: string; personnelId: string }) =>
      api.post(`/assignments/${input.assignmentId}/unassign`, {
        personnelId: input.personnelId,
      }),
    onSuccess: invalidate,
  });
}
