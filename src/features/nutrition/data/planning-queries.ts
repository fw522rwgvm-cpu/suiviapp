import { useMutation, useQuery } from '@tanstack/react-query';
import type { LocalDate } from '@/core/date';
import { getAppDatabase } from '@/core/db/app-database';
import {
  dayTemplate,
  dayTemplateMeal,
  planningOverride,
  planningWeekday,
  setting,
  type DayTemplateId,
} from '@/core/db/schema';
import { readsFrom } from '@/core/query';
import {
  readDayPlan,
  readPlanning,
  readTemplate,
  readTemplates,
  readTemplateUsage,
} from './planning-reads';
import {
  applyPlanTargetsToDay,
  assignWeekday,
  createTemplate,
  deleteTemplate,
  setDefaultTemplate,
  setOverride,
  updateTemplate,
} from './planning-writes';

/**
 * Reads are hooks; writes are the transactional functions of planning-writes.ts
 * (D8).
 *
 * > No cache invalidation is written by hand: it goes through the change bus.
 *
 * So there is deliberately not a single onSuccess here either. Editing a
 * target touches day_template_meal, SQLite reports it, and every query that
 * declared reading that table is invalidated — including the Journal's day
 * query, which is how a virtual day picks up a template edit without anything
 * enumerating a key.
 */

/**
 * The tables a day's resolution reads, declared once and shared.
 *
 * `setting` is in here because the default template pointer lives there, and
 * that has a cost worth naming rather than discovering: the rate limiter also
 * writes off_suspended_until into `setting`, so a burst of scanning in a shop
 * will invalidate the Journal. What that actually costs is re-running a
 * handful of primary-key lookups against a local synchronous database. The bus
 * already accepts that trade — "a refetch for nothing, never a wrong figure".
 */
export const PLANNING_TABLES = [
  dayTemplate,
  dayTemplateMeal,
  planningWeekday,
  planningOverride,
  setting,
] as const;

export const planningKeys = {
  templates: () => ['nutrition', 'templates'] as const,
  template: (id: DayTemplateId | null) => ['nutrition', 'template', id] as const,
  templateUsage: (id: DayTemplateId | null) => ['nutrition', 'template-usage', id] as const,
  planning: () => ['nutrition', 'planning'] as const,
  dayPlan: (date: LocalDate) => ['nutrition', 'day-plan', date] as const,
};

/** Every template, with its meal count. For the list screen (specs 8.8). */
export function useTemplates() {
  return useQuery({
    queryKey: planningKeys.templates(),
    queryFn: () => readTemplates(getAppDatabase()),
    meta: readsFrom(dayTemplate, dayTemplateMeal),
  });
}

/** One template with its meals, for the screen that edits it. */
export function useTemplate(id: DayTemplateId | null) {
  return useQuery({
    queryKey: planningKeys.template(id),
    queryFn: () => (id === null ? null : readTemplate(getAppDatabase(), id)),
    enabled: id !== null,
    meta: readsFrom(dayTemplate, dayTemplateMeal),
  });
}

/**
 * What deleting a template would actually take, for the confirmation that
 * names it (specs 5.3 v2.2).
 */
export function useTemplateUsage(id: DayTemplateId | null) {
  return useQuery({
    queryKey: planningKeys.templateUsage(id),
    queryFn: () => (id === null ? null : readTemplateUsage(getAppDatabase(), id)),
    enabled: id !== null,
    meta: readsFrom(planningWeekday, planningOverride, setting, dayTemplate),
  });
}

/** The week, the overrides and the default (specs 8.8, 12). */
export function usePlanning() {
  return useQuery({
    queryKey: planningKeys.planning(),
    queryFn: () => readPlanning(getAppDatabase()),
    meta: readsFrom(...PLANNING_TABLES),
  });
}

/**
 * What the planning prescribes for a date, right now (specs 8.2).
 *
 * Used by the Journal to name the template a VIRTUAL day resolves to, and to
 * offer that template's targets to a materialised day that has none. A
 * materialised day's own meals never come from here.
 */
export function useDayPlan(date: LocalDate) {
  return useQuery({
    queryKey: planningKeys.dayPlan(date),
    queryFn: () => readDayPlan(getAppDatabase(), date),
    meta: readsFrom(...PLANNING_TABLES),
  });
}

export function useCreateTemplate() {
  return useMutation({
    mutationFn: (input: Parameters<typeof createTemplate>[1]) =>
      Promise.resolve(createTemplate(getAppDatabase(), input)),
  });
}

export function useUpdateTemplate() {
  return useMutation({
    mutationFn: (input: {
      id: DayTemplateId;
      value: Parameters<typeof updateTemplate>[2];
    }) => Promise.resolve(updateTemplate(getAppDatabase(), input.id, input.value)),
  });
}

export function useDeleteTemplate() {
  return useMutation({
    mutationFn: (id: DayTemplateId) =>
      Promise.resolve(deleteTemplate(getAppDatabase(), id)),
  });
}

export function useAssignWeekday() {
  return useMutation({
    mutationFn: (input: { weekday: number; templateId: DayTemplateId | null }) =>
      Promise.resolve(assignWeekday(getAppDatabase(), input.weekday, input.templateId)),
  });
}

export function useSetOverride() {
  return useMutation({
    mutationFn: (input: { date: LocalDate; templateId: DayTemplateId | null }) =>
      Promise.resolve(setOverride(getAppDatabase(), input.date, input.templateId)),
  });
}

export function useSetDefaultTemplate() {
  return useMutation({
    mutationFn: (templateId: DayTemplateId | null) =>
      Promise.resolve(setDefaultTemplate(getAppDatabase(), templateId)),
  });
}

/** The explicit act that gives a materialised day the targets it never had. */
export function useApplyPlanTargets() {
  return useMutation({
    mutationFn: (date: LocalDate) =>
      Promise.resolve(applyPlanTargetsToDay(getAppDatabase(), date)),
  });
}
