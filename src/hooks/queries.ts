/** TanStack Query hooks — the single place server state is fetched. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Conflict, SchedulingRule } from '@shared/conflicts';
import type { SheetPlacement } from '@shared/crew';
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
  VolunteerOffer,
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
  volunteers: ['volunteers'] as const,
  openSeats: ['open-seats'] as const,
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
    openSeatCount: number;
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
  /** Every post covered — or standing empty — at the moment of the request. */
  onDuty: Assignment[];
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

/**
 * Removing a post. `withShifts` takes the shifts it was stood on with it, and
 * everyone who was ever on them — refused without it, so the size of the act is
 * always known before it happens.
 */
export function useDeleteAssignmentType() {
  const queryClient = useQueryClient();
  const invalidate = useScheduleInvalidation();
  return useMutation({
    mutationFn: (input: { id: string; withShifts?: boolean }) =>
      api.delete<{ id: string; shifts: number }>(
        `/assignment-types/${input.id}${input.withShifts ? '?shifts=delete' : ''}`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignmentTypes });
      invalidate();
    },
  });
}

/** Retiring a post that has been used, or bringing one back. */
export function useSetAssignmentTypeActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      api.patch<{ id: string }>(`/assignment-types/${input.id}`, { active: input.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.assignmentTypes }),
  });
}

/**
 * Where the posts sit on the duty sheet, after a card has been dragged.
 *
 * The whole page is sent, because moving one card moves every card below it —
 * see `moveSheetCard`. The board reads the layout off the assignments it has
 * already loaded, so both caches are dropped.
 */
export function useSaveSheetLayout() {
  const queryClient = useQueryClient();
  const invalidate = useScheduleInvalidation();
  return useMutation({
    mutationFn: (placements: SheetPlacement[]) =>
      api.put<{ placements: number }>('/assignment-types/layout', { placements }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignmentTypes });
      invalidate();
    },
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

export function useAssignments(
  window: { from: number; to: number; unitId?: string },
  enabled = true,
) {
  return useQuery({
    enabled,
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

export function useAvailability(
  window: { from?: number; to?: number; status?: string },
  enabled = true,
) {
  return useQuery({
    enabled,
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

/** Offers to stand a seat nobody is on: a soldier's own, or everyone's. */
export function useVolunteers(status?: string) {
  return useQuery({
    queryKey: [...queryKeys.volunteers, status] as const,
    queryFn: () => api.get<{ volunteers: VolunteerOffer[] }>('/volunteers', { status }),
    select: (data) => data.volunteers,
  });
}

export interface OpenSeat {
  assignmentId: string;
  title: string;
  section: string | null;
  startAt: number;
  endAt: number;
  role: string | null;
  roleLabel: string | null;
  missing: number;
}

export function useOpenSeats(enabled = true) {
  return useQuery({
    enabled,
    queryKey: queryKeys.openSeats,
    queryFn: () => api.get<{ seats: OpenSeat[] }>('/me/open-seats'),
    select: (data) => data.seats,
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

export function useMySchedule(enabled = true) {
  return useQuery({
    enabled,
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

/**
 * Invalidate everything that depends on the schedule after a write.
 *
 * The posts list is in here because a post carries `usageCount` — how many
 * shifts stand behind it — which every shift created or removed changes. A
 * stale count is not a cosmetic problem: it is what the sheet's own delete
 * offers to spend, so left unrefreshed it can say a post costs nothing while
 * the server refuses to remove it.
 */
export function useScheduleInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [
      'assignments',
      'assignment-types',
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
    /** `scope: 'day'` clears the person from every shift that starts that day. */
    mutationFn: (input: { assignmentId: string; personnelId: string; scope?: 'shift' | 'day' }) =>
      api.post<{ removed: number }>(`/assignments/${input.assignmentId}/unassign`, {
        personnelId: input.personnelId,
        scope: input.scope ?? 'shift',
      }),
    onSuccess: invalidate,
  });
}

/** Clears everyone off every shift that starts on one local day, in one action. */
export function useUnassignDay() {
  const invalidate = useScheduleInvalidation();
  return useMutation({
    mutationFn: (day: string) =>
      api.post<{ day: string; assignments: number; removed: number }>('/assignments/unassign-day', {
        day,
      }),
    onSuccess: invalidate,
  });
}

/** Lay out every standing post across a period, in one action. */
export function useStandingRoster() {
  const invalidate = useScheduleInvalidation();
  return useMutation({
    mutationFn: (input: { fromDate: string; toDate: string }) =>
      api.post<{ created: number; skipped: number; posts: number }>('/assignments/standing', input),
    onSuccess: invalidate,
  });
}

export function useUpdateAssignment() {
  const invalidate = useScheduleInvalidation();
  return useMutation({
    mutationFn: (input: {
      id: string;
      startAt?: number;
      endAt?: number;
      requiredHeadcount?: number;
      title?: string | null;
      notes?: string | null;
    }) => {
      const { id, ...body } = input;
      return api.patch<{ id: string }>(`/assignments/${id}`, body);
    },
    onSuccess: invalidate,
  });
}

/** Cancels the shift. The row and its history are kept, never deleted. */
/**
 * Taking one shift off the board. The server decides whether that is a deletion
 * or a cancellation — a shift nobody stood and nobody will is deleted; one that
 * is somebody's shift is struck off and kept — and says which it did.
 */
export function useCancelAssignment() {
  const invalidate = useScheduleInvalidation();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ id: string; status: 'deleted' | 'cancelled' }>(`/assignments/${id}`),
    onSuccess: invalidate,
  });
}
