import { useState, useEffect } from 'react'
import { SignInButton, UserButton } from '@clerk/clerk-react'
import { Authenticated, Unauthenticated, AuthLoading } from 'convex/react'
import PeopleTab from './peopleTab'
import MissionTab from './missionsTab'
import RulesTab from './rulesTab'
import CalendarTab from './calendarTab'
 

type TabType = 'people' | 'mission' | 'rules' | 'calendar'

// Types moved to ./types

// (helpers moved to ./utils/dateScheduling)

// Helper function to find the original start date of a repeat pattern for a given date
// Currently unused but kept for potential future use
// function findRepeatStartDate(person: Person, date: string): string | null {
//   if (person.repeatPatterns) {
//     for (const [startDate, pattern] of Object.entries(person.repeatPatterns)) {
//       if (matchesRuleRepeatPattern(date, startDate, pattern)) {
//         return startDate;
//       }
//     }
//   }
//   return null;
// }


// (legacy local effective availability removed; using util from `utils/dateScheduling`)

// (legacy TimeInput24 removed; using components/UnifiedDateSelection/TimeInput24)

// (legacy RemoveRepeatPopup removed; using components/UnifiedDateSelection/RemoveRepeatPopup)


// (legacy RepeatPopup removed; using components/UnifiedDateSelection/RepeatPopup)

export default function App() {
  // Force 24-hour time format on component mount
  useEffect(() => {
    // Set document locale
    document.documentElement.lang = 'en-GB'
    
    // Add observer to handle dynamically added time inputs
    const observer = new MutationObserver(() => {
      const timeInputs = document.querySelectorAll('input[type="time"]')
      timeInputs.forEach(input => {
        input.setAttribute('lang', 'en-GB')
        input.setAttribute('data-time-format', '24')
      })
    })
    
    observer.observe(document.body, { childList: true, subtree: true })
    
    return () => observer.disconnect()
  }, [])

  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <AuthLoading>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh',
          fontSize: '18px',
          fontWeight: 'bold'
        }}>
          Loading...
        </div>
      </AuthLoading>

      <Unauthenticated>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh',
          padding: '20px',
          textAlign: 'center'
        }}>
          <h1 style={{ 
            fontSize: '32px', 
            fontWeight: 'bold', 
            marginBottom: '20px',
            color: '#000000'
          }}>
            SHIFTS
          </h1>
          <p style={{ 
            fontSize: '16px', 
            marginBottom: '40px',
            color: '#000000'
          }}>
            Sign in to continue
          </p>
          <SignInButton mode="modal">
            <button style={{ 
              padding: '16px 32px', 
              fontSize: '16px', 
              fontWeight: 'bold',
              backgroundColor: '#000000', 
              color: '#ffffff', 
              border: 'none', 
              borderRadius: '0px',
              cursor: 'pointer',
              width: '200px'
            }}>
              SIGN IN
            </button>
          </SignInButton>
        </div>
      </Unauthenticated>

      <Authenticated>
        <ShiftsApp />
      </Authenticated>
    </div>
  );
}

function ShiftsApp() {
  const [activeTab, setActiveTab] = useState<TabType>('people')

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ 
        padding: '16px 20px',
        borderBottom: '2px solid #000000',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#ffffff'
      }}>
        <h1 style={{ 
          fontSize: '24px', 
          fontWeight: 'bold', 
          margin: 0,
          color: '#000000'
        }}>
          SHIFTS
        </h1>
          <div className="avatar-focus">
            <UserButton 
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  userButtonTrigger: {
                    padding: 0,
                    width: '28px',
                    height: '28px',
                    minWidth: '28px',
                    minHeight: '28px',
                    borderRadius: '9999px',
                  },
                  userButtonAvatarBox: {
                    width: '28px',
                    height: '28px',
                    borderRadius: '9999px',
                    overflow: 'hidden',
                  },
                },
              }}
            />
          </div>
      </header>

      {/* Content Area */}
      <main style={{ 
        flex: 1, 
        padding: '20px', 
        // Reserve space so fixed bottom nav doesn't cover content
        paddingBottom: '84px', 
        overflowY: 'auto' 
      }}>
        {activeTab === 'people' && <PeopleTab />}
        {activeTab === 'mission' && <MissionTab />}
        {activeTab === 'rules' && <RulesTab />}
        {activeTab === 'calendar' && <CalendarTab />}
      </main>

      {/* Bottom Tab Navigation */}
      <nav style={{ 
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        borderTop: '2px solid #000000',
        display: 'flex',
        backgroundColor: '#ffffff',
        // Support iOS safe area
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}>
        {[
          { id: 'people' as TabType, label: 'PEOPLE' },
          { id: 'mission' as TabType, label: 'MISSIONS' },
          { id: 'rules' as TabType, label: 'RULES' },
          { id: 'calendar' as TabType, label: 'CALENDAR' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '20px 8px',
              fontSize: '12px',
              fontWeight: 'bold',
              backgroundColor: activeTab === tab.id ? '#000000' : '#ffffff',
              color: activeTab === tab.id ? '#ffffff' : '#000000',
              border: 'none',
              borderRight: tab.id !== 'calendar' ? '1px solid #000000' : 'none',
              cursor: 'pointer',
              textAlign: 'center'
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
}




// Calendar Event interface removed (mission-based calendar)








// Helper function to check if a date matches a mission repeat pattern
// (legacy local mission repeat helpers removed)

// Mission Calendar Component - Commented out for now

// MissionCalendarCell component - commented out for now



// (legacy rule helpers removed)

// Helper function to check if a rule pattern has future repeats stopped
// (legacy rule repeat helper removed)

// (legacy RuleCalendarGrid removed; using UnifiedDateGrid instead)

/* legacy RuleCalendarCell removed */





// Unified Calendar Component
/* legacy CalendarData/Unified calendar types removed */
/* interface CalendarData {
  _id: string;
  name: string;
  schedule?: Record<string, { scheduled: boolean; startTime?: string; endTime?: string }>;
  availability?: Record<string, { unavailable: boolean; startTime?: string; endTime?: string }>;
  repeatPatterns?: Record<string, { every: number; unit: 'day' | 'week' | 'month'; scheduled?: boolean; unavailable?: boolean; startTime?: string; endTime?: string }>;
  repeatExceptions?: string[];
} */

// (legacy UnifiedCalendarGrid removed)

// (legacy UnifiedCalendarCell removed)
