import { lazy, Suspense } from 'react';
import { ActivityIndicator } from 'react-native';

// Load the web-only admin framework only when this review page is opened.
const Review = lazy(() => import('./NicknameReviewAdmin.web'));
export function NicknameReviewScreen() {
  return <Suspense fallback={<ActivityIndicator accessibilityLabel="正在加载审核表格" />}><Review /></Suspense>;
}
