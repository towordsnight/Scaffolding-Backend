import type { ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { DashboardRoute } from './routes/DashboardRoute';
import { LoginRoute } from './routes/LoginRoute';
import { RegisterRoute } from './routes/RegisterRoute';
import { ConsentRoute } from './routes/ConsentRoute';
import { SelfDeclareRoute } from './routes/SelfDeclareRoute';
import { DiagnosticRoute } from './routes/DiagnosticRoute';
import { ProblemRoute } from './routes/ProblemRoute';
import { DesignProblemRoute } from './routes/DesignProblemRoute';
import { DesignShowcaseRoute } from './routes/DesignShowcaseRoute';

const shell = (element: ReactNode) => <AppShell>{element}</AppShell>;

export const router = createBrowserRouter([
  { path: '/',                        element: <LoginRoute /> },
  { path: '/login',                   element: <LoginRoute /> },
  { path: '/dashboard',               element: <DashboardRoute /> },
  { path: '/register',                element: shell(<RegisterRoute />) },
  { path: '/onboarding/consent',      element: shell(<ConsentRoute />) },
  { path: '/onboarding/self-declare', element: <SelfDeclareRoute /> },
  { path: '/onboarding/diagnostic',   element: shell(<DiagnosticRoute />) },
  { path: '/problems/:id',            element: <ProblemRoute /> },
  { path: '/design/showcase',         element: <DesignShowcaseRoute /> },
  { path: '/design/problem',          element: <DesignProblemRoute /> },
]);
