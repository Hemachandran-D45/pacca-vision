import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { QueueCountProvider } from "./contexts/QueueCountContext";
import Home from "./pages/Home";
import { SolutionProvider } from "./senderra/SolutionContext";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/404" component={NotFound} />
      <Route component={Home} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <SolutionProvider>
          <QueueCountProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </QueueCountProvider>
        </SolutionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
