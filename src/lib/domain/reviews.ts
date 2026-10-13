/**
 * Review content screening. Mirrors app.review_flags(): reviews that might
 * disclose contact details, identifiers or case numbers are held for moderation
 * to protect client confidentiality.
 */
export type ReviewFlag = 'phone_or_id' | 'email' | 'link' | 'case_number'

export function reviewFlags(text: string): ReviewFlag[] {
  const flags: ReviewFlag[] = []
  if (/(\+?2?01[0125][0-9]{8})|([0-9٠-٩]{10,})/.test(text)) flags.push('phone_or_id')
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) flags.push('email')
  if (/(https?:\/\/|www\.)/i.test(text)) flags.push('link')
  if (/(قضية|دعوى|جنحة|جناية)\s*(رقم)?\s*[0-9٠-٩]+/.test(text)) flags.push('case_number')
  return flags
}

/** Bayesian-smoothed rating used for relevance ranking (prior: 4.0 over 5 reviews). */
export function smoothedRating(avg: number, count: number, prior = 4.0, weight = 5): number {
  return (avg * count + prior * weight) / (count + weight)
}
