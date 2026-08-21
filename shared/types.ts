/** Domain types shared by the Pages Functions API and the React client. */

export type Role = 'system_admin' | 'company_commander' | 'unit_scheduler' | 'soldier' | 'viewer';

export type UnitKind = 'company' | 'platoon' | 'team';
export type PersonnelStatus = 'active' | 'inactive' | 'archived';
export type AvailabilityKind = 'available' | 'leave' | 'training' | 'medical' | 'home' | 'other';
export type AvailabilityStatus = 'pending' | 'approved' | 'rejected';
export type ScheduleStatus = 'draft' | 'in_review' | 'published' | 'archived';
export type PublicationState = 'draft' | 'published' | 'modified';
export type AssignmentStatus = 'planned' | 'cancelled';
export type ReplacementStatus = 'pending' | 'proposed' | 'approved' | 'rejected' | 'cancelled';
export type Severity = 'info' | 'warning' | 'blocking';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  personnelId: string | null;
  unitScope: string[];
  permissions: string[];
  mfaEnabled: boolean;
}

export interface Unit {
  id: string;
  parentId: string | null;
  name: string;
  kind: UnitKind;
  sortOrder: number;
  active: boolean;
}

export interface Qualification {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  /**
   * Restricts its holder rather than merely permitting them: whoever is marked
   * חמ״ל is scheduled for חמ״ל and nothing else.
   */
  exclusive: boolean;
}

export interface Personnel {
  id: string;
  unitId: string | null;
  unitName: string | null;
  externalId: string | null;
  displayName: string;
  roleTitle: string | null;
  phone: string | null;
  status: PersonnelStatus;
  notes: string | null;
  qualificationIds: string[];
}

export interface Availability {
  id: string;
  personnelId: string;
  personnelName?: string;
  kind: AvailabilityKind;
  startAt: number;
  endAt: number;
  status: AvailabilityStatus;
  reason: string | null;
  createdAt: number;
}

export interface AssignmentType {
  id: string;
  name: string;
  category: string | null;
  defaultDurationMinutes: number;
  requiredHeadcount: number;
  priority: number;
  color: string;
  instructions: string | null;
  active: boolean;
  requiredQualifications: { qualificationId: string; minCount: number }[];
}

export interface AssignmentAssignee {
  personnelId: string;
  personnelName: string;
  unitId: string | null;
  /** Qualification naming the seat they fill, or null for a plain לוחם seat. */
  role: string | null;
  assignedAt: number;
  acknowledgedAt: number | null;
  overrideReason: string | null;
}

export interface Assignment {
  id: string;
  scheduleId: string | null;
  assignmentTypeId: string;
  assignmentTypeName: string;
  color: string;
  unitId: string | null;
  title: string | null;
  startAt: number;
  endAt: number;
  requiredHeadcount: number;
  status: AssignmentStatus;
  publicationState: PublicationState;
  notes: string | null;
  assignees: AssignmentAssignee[];
  requiredQualifications: { qualificationId: string; minCount: number }[];
  /** Standing orders from the assignment type — the sheet's הערות column. */
  instructions: string | null;
  updatedAt: number;
}

export interface Schedule {
  id: string;
  unitId: string | null;
  name: string;
  startDate: string;
  endDate: string;
  status: ScheduleStatus;
  version: number;
  publishedAt: number | null;
  createdAt: number;
}

export interface ReplacementRequest {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  startAt: number;
  endAt: number;
  personnelId: string;
  personnelName: string;
  replacementPersonnelId: string | null;
  replacementPersonnelName: string | null;
  status: ReplacementStatus;
  reason: string | null;
  createdAt: number;
  decidedAt: number | null;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: number | null;
  createdAt: number;
}

export interface AuditEvent {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
