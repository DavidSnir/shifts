import { useState, useEffect } from 'react'
import { SignInButton, UserButton } from '@clerk/clerk-react'
import { Authenticated, Unauthenticated, AuthLoading, useQuery, useMutation } from 'convex/react'
import { api } from '../convex/_generated/api'

type TabType = 'people' | 'mission' | 'rules' | 'calendar'

interface Person {
  _id: string;
  name: string;
  userId: string;
  properties: Record<string, boolean>; // ASCII keys -> boolean values
  propertyNames: Record<string, string>; // ASCII keys -> display names (Hebrew/etc)
  availability: Record<string, { unavailable: boolean; startTime?: string; endTime?: string }>; // date -> availability info
  repeatPatterns?: Record<string, { // date -> repeat pattern
    every: number;
    unit: 'day' | 'week' | 'month';
    unavailable: boolean;
    startTime?: string;
    endTime?: string;
  }>;
  repeatExceptions?: string[]; // dates that should be excluded from repeats
  _creationTime: number;
}

interface Mission {
  _id: string;
  name: string;
  userId: string;
  propertyFilters: Record<string, { required: boolean; value: boolean }>; // required: true = WITH property, false = WITHOUT property
  schedule: Record<string, { scheduled: boolean; startTime?: string; endTime?: string }>; // date -> schedule info
  repeatPatterns?: Record<string, { // date -> repeat pattern
    every: number;
    unit: 'day' | 'week' | 'month';
    scheduled: boolean;
    startTime?: string;
    endTime?: string;
  }>;
  repeatExceptions?: string[]; // dates that should be excluded from repeats
  _creationTime: number;
}

// Helper function to get 3 weeks starting from a specific week offset (Sunday start)
function getThreeWeeks(weekOffset: number = 0): { weekNumbers: number[]; dates: string[][] } {
  const today = new Date();
  
  // Get the Sunday of current week
  const currentSunday = new Date(today);
  const dayOfWeek = today.getDay(); // Sunday=0, Monday=1, etc.
  currentSunday.setDate(today.getDate() - dayOfWeek);
  
  // Add week offset
  currentSunday.setDate(currentSunday.getDate() + (weekOffset * 7));
  
  const weeks: string[][] = [];
  const weekNumbers: number[] = [];
  
  for (let weekIndex = 0; weekIndex < 3; weekIndex++) {
    const weekStart = new Date(currentSunday);
    weekStart.setDate(currentSunday.getDate() + (weekIndex * 7));
    
    const weekNumber = getWeekNumber(weekStart);
    weekNumbers.push(weekNumber);
    
    const weekDates: string[] = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + dayIndex);
      weekDates.push(date.toISOString().split('T')[0]);
    }
    weeks.push(weekDates);
  }
  
  return { weekNumbers, dates: weeks };
}

// Helper function to get week number
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// Helper function to get today's date string
function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

// Helper function to check if date is today
function isToday(dateString: string): boolean {
  return dateString === getTodayString();
}

// Helper function to get day of month from date string
function getDayOfMonth(dateString: string): number {
  const date = new Date(dateString + 'T00:00:00');
  return date.getDate();
}

// Helper function to check if a date matches a repeat pattern
function matchesRepeatPattern(date: string, startDate: string, pattern: { every: number; unit: 'day' | 'week' | 'month' }): boolean {
  const targetDate = new Date(date + 'T00:00:00');
  const patternStartDate = new Date(startDate + 'T00:00:00');
  
  if (targetDate <= patternStartDate) return false;
  
  const diffTime = targetDate.getTime() - patternStartDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (pattern.unit === 'day') {
    return diffDays % pattern.every === 0;
  } else if (pattern.unit === 'week') {
    return diffDays % (pattern.every * 7) === 0;
  } else if (pattern.unit === 'month') {
    // For monthly repeats, check if it's the same day of month
    const targetDay = targetDate.getDate();
    const startDay = patternStartDate.getDate();
    if (targetDay !== startDay) return false;
    
    const monthDiff = (targetDate.getFullYear() - patternStartDate.getFullYear()) * 12 + 
                     (targetDate.getMonth() - patternStartDate.getMonth());
    return monthDiff % pattern.every === 0;
  }
  
  return false;
}

// Helper function to find the original start date of a repeat pattern for a given date
function findRepeatStartDate(person: Person, date: string): string | null {
  if (person.repeatPatterns) {
    for (const [startDate, pattern] of Object.entries(person.repeatPatterns)) {
      if (matchesRepeatPattern(date, startDate, pattern)) {
        return startDate;
      }
    }
  }
  return null;
}

// Helper function to check if future repeats have been stopped for a pattern
function hasFutureRepeatsStopped(person: Person, startDate: string): boolean {
  if (!person.repeatPatterns || !person.repeatPatterns[startDate] || !person.repeatExceptions) {
    return false;
  }
  
  const pattern = person.repeatPatterns[startDate];
  const today = new Date().toISOString().split('T')[0];
  const todayDate = new Date(today + 'T00:00:00');
  const patternStartDate = new Date(startDate + 'T00:00:00');
  
  // Check if there's at least one future exception that matches this pattern
  for (const exceptionDate of person.repeatExceptions) {
    const exceptionDateObj = new Date(exceptionDate + 'T00:00:00');
    
    // Only check future dates
    if (exceptionDateObj > todayDate) {
      const diffTime = exceptionDateObj.getTime() - patternStartDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 0) {
        let matches = false;
        if (pattern.unit === 'day') {
          matches = diffDays % pattern.every === 0;
        } else if (pattern.unit === 'week') {
          matches = diffDays % (pattern.every * 7) === 0;
        } else if (pattern.unit === 'month') {
          const targetDay = exceptionDateObj.getDate();
          const startDay = patternStartDate.getDate();
          if (targetDay === startDay) {
            const monthDiff = (exceptionDateObj.getFullYear() - patternStartDate.getFullYear()) * 12 + 
                             (exceptionDateObj.getMonth() - patternStartDate.getMonth());
            matches = monthDiff % pattern.every === 0;
          }
        }
        
        if (matches) {
          return true; // Found at least one future exception
        }
      }
    }
  }
  
  return false;
}

// Helper function to get effective availability for a date (including repeats)
function getEffectiveAvailability(person: Person, date: string): { unavailable: boolean; startTime?: string; endTime?: string; isRepeated?: boolean; isRepeatOrigin?: boolean; isResetOrigin?: boolean; originalStartDate?: string; futureRepeatsStopped?: boolean; wasBrokenFromPattern?: boolean } | undefined {
  // Check if this date is the origin of a repeat pattern
  const isRepeatOrigin = person.repeatPatterns && person.repeatPatterns[date];
  
  console.log('getEffectiveAvailability called for date:', date, {
    hasDirectAvailability: !!person.availability[date],
    isRepeatOrigin: !!isRepeatOrigin,
    directAvailability: person.availability[date],
    repeatPatterns: person.repeatPatterns ? Object.keys(person.repeatPatterns) : [],
    repeatExceptions: person.repeatExceptions || [],
    isThisDateInExceptions: person.repeatExceptions?.includes(date)
  });
  
  // PRIORITY 1: Direct availability for repeat origins (reset case)
  // If this is a repeat origin with direct availability, it means it was reset
  if (isRepeatOrigin && person.availability[date]) {
    const result = {
      ...person.availability[date],
      isRepeated: false, // Reset origins are not "repeated"
      isRepeatOrigin: true,
      isResetOrigin: true, // NEW FLAG: This origin was reset
      originalStartDate: date,
      futureRepeatsStopped: hasFutureRepeatsStopped(person, date),
      wasBrokenFromPattern: false
    };
    
    console.log('Returning RESET original cell for date:', date, result);
    return result;
  }
  
  // PRIORITY 2: Direct availability for non-pattern dates (broken from pattern)
  if (person.availability[date] && !isRepeatOrigin) {
    // Check if this date was originally part of a pattern but now broken
    let wasBrokenFromPattern = false;
    if (person.repeatPatterns) {
      for (const [startDate, pattern] of Object.entries(person.repeatPatterns)) {
        if (matchesRepeatPattern(date, startDate, pattern)) {
          wasBrokenFromPattern = true;
          break;
        }
      }
    }
    
    const result = {
      ...person.availability[date],
      isRepeated: false, // Direct availability is never considered "repeated"
      isRepeatOrigin: false,
      isResetOrigin: false, // Not a reset origin
      originalStartDate: undefined,
      futureRepeatsStopped: false,
      wasBrokenFromPattern
    };
    
    console.log('Returning direct availability for broken-from-pattern date:', date, result);
    return result;
  }
  
  // PRIORITY 3: Check if date is in exceptions (canceled repeats)
  // BUT: if the date also has direct availability, prioritize that (user manually set it)
  if (person.repeatExceptions?.includes(date) && !person.availability[date]) {
    console.log('Date is in exceptions (canceled repeat) and has no direct availability:', date);
    return undefined;
  }
  
  if (person.repeatExceptions?.includes(date) && person.availability[date]) {
    console.log('Date is in exceptions BUT has direct availability (user override):', date);
    // Continue to pattern checking - don't return undefined
  }
  
  // PRIORITY 4: Check repeat patterns (including original dates without reset)
  if (person.repeatPatterns) {
    console.log('Checking repeat patterns for date:', date, 'patterns:', Object.keys(person.repeatPatterns));
    for (const [startDate, pattern] of Object.entries(person.repeatPatterns)) {
      if (matchesRepeatPattern(date, startDate, pattern)) {
        // Check if this is the original date or a repeated instance
        const isThisTheOrigin = date === startDate;
        
        const result = {
          unavailable: pattern.unavailable,
          // Keep FULL day as empty strings, don't convert to specific times
          startTime: pattern.startTime || '',
          endTime: pattern.endTime || '',
          isRepeated: !isThisTheOrigin, // Only repeated instances are marked as "repeated"
          isRepeatOrigin: isThisTheOrigin,
          isResetOrigin: false, // Pattern-derived availability is never reset
          originalStartDate: startDate,
          futureRepeatsStopped: hasFutureRepeatsStopped(person, startDate),
          wasBrokenFromPattern: false
        };
        
        if (isThisTheOrigin) {
          console.log('Returning ORIGINAL pattern cell for date:', date, result);
        } else {
          console.log('Returning REPEATED instance for date:', date, 'from pattern:', startDate, result);
        }
        return result;
      }
    }
  }
  
  console.log('No availability found for date:', date, 'returning undefined');
  return undefined;
}

// Custom 24-hour time input component
function TimeInput24({ 
  value, 
  onChange, 
  onBlur 
}: { 
  value: string; 
  onChange: (value: string) => void; 
  onBlur: () => void; 
}) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value.replace(/[^0-9:]/g, '');
    
    // Auto-format as user types
    if (inputValue.length === 2 && !inputValue.includes(':')) {
      inputValue += ':';
    }
    
    // Limit to HH:MM format
    if (inputValue.length > 5) {
      inputValue = inputValue.substring(0, 5);
    }
    
    setDisplayValue(inputValue);
    
    // Validate and update parent only if complete or empty
    if (inputValue === '') {
      onChange('');
    } else if (inputValue.match(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)) {
      const [hours, minutes] = inputValue.split(':');
      const formattedTime = `${hours.padStart(2, '0')}:${minutes}`;
      onChange(formattedTime);
    }
  };

  const handleBlur = () => {
    // Allow empty values
    if (displayValue === '') {
      onChange('');
      onBlur();
      return;
    }
    
    // Format on blur
    const match = displayValue.match(/^(\d{1,2}):?(\d{0,2})$/);
    if (match) {
      const hours = Math.min(parseInt(match[1] || '0'), 23);
      const minutes = Math.min(parseInt(match[2] || '0'), 59);
      const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      setDisplayValue(formattedTime);
      onChange(formattedTime);
    } else {
      // Reset to last valid value if invalid
      setDisplayValue(value);
    }
    onBlur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Allow: backspace, delete, tab, escape, enter, colon, and numbers
    if ([8, 9, 27, 13, 186, 16].indexOf(e.keyCode) !== -1 ||
        // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
        (e.keyCode === 65 && e.ctrlKey === true) ||
        (e.keyCode === 67 && e.ctrlKey === true) ||
        (e.keyCode === 86 && e.ctrlKey === true) ||
        (e.keyCode === 88 && e.ctrlKey === true) ||
        // Allow numbers
        (e.keyCode >= 48 && e.keyCode <= 57) ||
        (e.keyCode >= 96 && e.keyCode <= 105)) {
      return;
    }
    e.preventDefault();
  };

  return (
    <input
      type="text"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder="HH:MM"
      maxLength={5}
      style={{
        fontSize: '12px',
        padding: '4px',
        border: '2px solid #000000',
        fontFamily: 'monospace',
        textAlign: 'center',
        minHeight: '28px',
        width: '100%'
      }}
    />
  );
}

// Remove Repeat Popup Component
function RemoveRepeatPopup({
  personId,
  date,
  onRemoveOne,
  onRemoveAllFollowing,
  onClose
}: {
  personId: string;
  date: string;
  onRemoveOne: (personId: string, date: string) => void;
  onRemoveAllFollowing: (personId: string, date: string) => void;
  onClose: () => void;
}) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        border: '3px solid #000000',
        padding: '24px',
        maxWidth: '300px',
        width: '90%',
        position: 'relative',
        zIndex: 10000
      }}>
        <div style={{
          fontSize: '16px',
          fontWeight: 'bold',
          marginBottom: '16px',
          textAlign: 'center'
        }}>
          REMOVE REPEAT
      </div>
        
        <div style={{
          fontSize: '14px',
          marginBottom: '20px',
          textAlign: 'center'
        }}>
          Date: {new Date(date + 'T00:00:00').toLocaleDateString()}
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <button
            onClick={() => onRemoveOne(personId, date)}
            style={{
              fontSize: '14px',
              fontWeight: 'bold',
              padding: '12px 16px',
              backgroundColor: '#000000',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            REMOVE ONLY THIS DATE
        </button>
          
          <button
            onClick={() => onRemoveAllFollowing(personId, date)}
            style={{
              fontSize: '14px',
              fontWeight: 'bold',
              padding: '12px 16px',
              backgroundColor: '#ffffff',
              color: '#000000',
              border: '2px solid #000000',
              cursor: 'pointer'
            }}
          >
            REMOVE THIS & ALL FOLLOWING
          </button>
          
          <button
            onClick={onClose}
            style={{
              fontSize: '14px',
              fontWeight: 'bold',
              padding: '12px 16px',
              backgroundColor: '#ffffff',
              color: '#000000',
              border: '2px solid #000000',
              cursor: 'pointer'
            }}
          >
            CANCEL
          </button>
      </div>
      </div>
    </div>
  );
}


// Repeat Popup Component
function RepeatPopup({
  personId,
  date,
  availability,
  onApply,
  onClose
}: {
  personId: string;
  date: string;
  availability: { unavailable: boolean; startTime?: string; endTime?: string };
  onApply: (personId: string, date: string, availability: { unavailable: boolean; startTime?: string; endTime?: string }, repeatEvery: number, repeatUnit: 'day' | 'week' | 'month', enableRepeat: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [enableRepeat, setEnableRepeat] = useState(false);
  const [repeatEvery, setRepeatEvery] = useState(1);
  const [repeatUnit, setRepeatUnit] = useState<'day' | 'week' | 'month'>('week');

  const handleApply = () => {
    onApply(personId, date, availability, repeatEvery, repeatUnit, enableRepeat);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        border: '3px solid #000000',
        padding: '24px',
        maxWidth: '300px',
        width: '90%',
        position: 'relative',
        zIndex: 10000
      }}>
        <div style={{
          fontSize: '16px',
          fontWeight: 'bold',
          marginBottom: '16px',
          textAlign: 'center'
        }}>
          REPEAT ABSENCE
        </div>
        
        <div style={{
          fontSize: '14px',
          marginBottom: '12px',
          textAlign: 'center'
        }}>
          Starting from: {new Date(date + 'T00:00:00').toLocaleDateString()}
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          marginBottom: '16px'
        }}>
          <div
            style={{
              width: '18px',
              height: '18px',
              border: '2px solid #000000',
              backgroundColor: enableRepeat ? '#000000' : '#ffffff',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              fontSize: '12px',
              color: enableRepeat ? '#ffffff' : '#000000',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
            onClick={() => setEnableRepeat(!enableRepeat)}
          >
            {enableRepeat ? '✓' : ''}
          </div>
          <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Enable Repeat</span>
        </div>

        {enableRepeat && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '20px'
          }}>
            <span style={{ fontSize: '14px', fontWeight: 'bold' }}>every</span>
          
          <select
            value={repeatEvery}
            onChange={(e) => setRepeatEvery(parseInt(e.target.value))}
            style={{
              fontSize: '14px',
              padding: '4px',
              border: '2px solid #000000',
              fontFamily: 'inherit'
            }}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>

          <select
            value={repeatUnit}
            onChange={(e) => setRepeatUnit(e.target.value as 'day' | 'week' | 'month')}
            style={{
              fontSize: '14px',
              padding: '4px',
              border: '2px solid #000000',
              fontFamily: 'inherit'
            }}
          >
            <option value="day">day{repeatEvery > 1 ? 's' : ''}</option>
            <option value="week">week{repeatEvery > 1 ? 's' : ''}</option>
            <option value="month">month{repeatEvery > 1 ? 's' : ''}</option>
          </select>
          </div>
        )}

        <div style={{
          display: 'flex',
          gap: '8px',
          justifyContent: 'center'
        }}>
          <button
            onClick={handleApply}
            style={{
              fontSize: '14px',
              fontWeight: 'bold',
              padding: '8px 16px',
              backgroundColor: '#000000',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            APPLY
        </button>
          <button
            onClick={onClose}
            style={{
              fontSize: '14px',
              fontWeight: 'bold',
              padding: '8px 16px',
              backgroundColor: '#ffffff',
              color: '#000000',
              border: '2px solid #000000',
              cursor: 'pointer'
            }}
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}

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
        <UserButton afterSignOutUrl="/" />
      </header>

      {/* Content Area */}
      <main style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
        {activeTab === 'people' && <PeopleTab />}
        {activeTab === 'mission' && <MissionTab />}
        {activeTab === 'rules' && <RulesTab />}
        {activeTab === 'calendar' && <CalendarTab />}
      </main>

      {/* Bottom Tab Navigation */}
      <nav style={{ 
        borderTop: '2px solid #000000',
        display: 'flex',
        backgroundColor: '#ffffff'
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

function PeopleTab() {
  const [editingPersonName, setEditingPersonName] = useState<string | null>(null)
  const [newPersonName, setNewPersonName] = useState('')
  const [addingProperty, setAddingProperty] = useState(false)
  const [newPropertyName, setNewPropertyName] = useState('')
  const [showingPersonPage, setShowingPersonPage] = useState<Person | null>(null)
  const [weekOffset, setWeekOffset] = useState(0)
  
  const people = useQuery(api.people.list) as Person[] | undefined
  const addPerson = useMutation(api.people.add)
  const updateName = useMutation(api.people.updateName)
  const updateProperty = useMutation(api.people.updateProperty)
  const addProperty = useMutation(api.people.addProperty)
  const removeProperty = useMutation(api.people.removeProperty)
  const removePerson = useMutation(api.people.remove)
  const updateAvailability = useMutation(api.people.updateAvailability)
  const addRepeatPattern = useMutation(api.people.addRepeatPattern)
  const removeRepeatPattern = useMutation(api.people.removeRepeatPattern)
  const addRepeatException = useMutation(api.people.addRepeatException)
  const stopFutureRepeats = useMutation(api.people.stopFutureRepeats)
  const clearRepeatExceptions = useMutation(api.people.clearRepeatExceptions)



  // Auto-start editing when a new person with empty name is detected
  useEffect(() => {
    if (people && editingPersonName === null && newPersonName === '') {
      const newPerson = people.find(p => p.name === '')
      if (newPerson) {
        setEditingPersonName(newPerson._id)
      }
    }
  }, [people, editingPersonName, newPersonName])

  const handleAddPerson = async () => {
    await addPerson({ name: "" })
    // The new person will appear in the list with empty name, set it for editing
    setNewPersonName('')
    // We'll set the editing state when the component re-renders and we find the new person
  }

  const handleSaveName = async (personId: string, name: string) => {
    const trimmedName = name.trim()
    
    // Validation: name cannot be empty
    if (!trimmedName) {
      return // Don't save or exit edit mode
    }
    
    // Validation: name cannot be duplicate (excluding current person)
    const isDuplicate = people?.some(p => p._id !== personId && p.name.toLowerCase() === trimmedName.toLowerCase())
    if (isDuplicate) {
      return // Don't save or exit edit mode
    }
    
    await updateName({ id: personId as any, name: trimmedName })
    setEditingPersonName(null)
    setNewPersonName('')
  }

  const handleCancelNameEdit = () => {
    setEditingPersonName(null)
    setNewPersonName('')
  }

  const handlePropertyToggle = async (personId: string, propertyKey: string, currentValue: boolean) => {
    await updateProperty({ 
      id: personId as any, 
      propertyKey, 
      value: !currentValue 
    })
  }

  const handleAddProperty = async () => {
    const trimmedName = newPropertyName.trim()
    
    if (trimmedName.length > 0) {
      try {
        await addProperty({ propertyName: trimmedName })
        setNewPropertyName('')
        setAddingProperty(false)
      } catch (error) {
        console.error('Error adding property:', error)
      }
    }
  }

  const handleCancelAddProperty = () => {
    setNewPropertyName('')
    setAddingProperty(false)
  }

  const handleRemoveProperty = async (propertyKey: string) => {
    await removeProperty({ propertyKey })
  }

  const handleUpdateAvailability = async (personId: string, date: string, unavailable: boolean, startTime?: string, endTime?: string) => {
    await updateAvailability({ 
      id: personId as any, 
      date, 
      unavailable, 
      startTime, 
      endTime 
    })
  }



  // Get all property keys and their display names
  const allPropertyKeys = people && people.length > 0 
    ? Object.keys(people[0].properties || {})
    : []
  
  const getPropertyDisplayName = (key: string): string => {
    if (people && people.length > 0) {
      return people[0].propertyNames?.[key] || key
    }
    return key
  }

      // If showing person page, render that instead
  if (showingPersonPage) {
    // Find the current version of the person from the live query
    const currentPerson = people?.find(p => p._id === showingPersonPage._id)
    
    if (!currentPerson) {
      // Person was deleted, go back to list
      setShowingPersonPage(null)
      return null
    }
    
    return (
      <PersonPage 
        person={currentPerson}
        allPropertyKeys={allPropertyKeys}
        getPropertyDisplayName={getPropertyDisplayName}
        addingProperty={addingProperty}
        newPropertyName={newPropertyName}
        onPropertyToggle={handlePropertyToggle}
        onStartAddProperty={() => setAddingProperty(true)}
        onAddProperty={handleAddProperty}
        onCancelAddProperty={handleCancelAddProperty}
        onPropertyNameChange={setNewPropertyName}
        onRemoveProperty={handleRemoveProperty}
        onUpdateName={handleSaveName}
        onUpdateAvailability={handleUpdateAvailability}
        onOpenRepeat={() => {}} // Will be handled inside PersonPage
        weekOffset={weekOffset}
        onWeekOffsetChange={setWeekOffset}
        onBack={() => setShowingPersonPage(null)}
        onDelete={() => {
          removePerson({ id: currentPerson._id as any })
          setShowingPersonPage(null)
        }}
        addRepeatPattern={addRepeatPattern}
        removeRepeatPattern={removeRepeatPattern}
        addRepeatException={addRepeatException}
        stopFutureRepeats={stopFutureRepeats}
        clearRepeatExceptions={clearRepeatExceptions}
      />
    )
  }

  return (
    <div>
      <h2 style={{ 
        fontSize: '20px', 
        fontWeight: 'bold', 
        marginBottom: '20px',
        color: '#000000'
      }}>
        PEOPLE
      </h2>

      {people === undefined ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontWeight: 'bold' }}>LOADING...</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {people.map((person) => (
            <div
              key={person._id}
              style={{
                border: '2px solid #000000',
                padding: '16px',
                backgroundColor: '#ffffff',
                cursor: editingPersonName === person._id ? 'default' : 'pointer'
              }}
              onClick={() => editingPersonName !== person._id && setShowingPersonPage(person)}
            >
              {editingPersonName === person._id ? (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={newPersonName}
                    placeholder="new person"
                    onChange={(e) => setNewPersonName(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      border: '2px solid #000000',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      fontFamily: 'inherit',
                      backgroundColor: '#ffffff'
                    }}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveName(person._id, newPersonName)
                      } else if (e.key === 'Escape') {
                        handleCancelNameEdit()
                      }
                    }}
                  />
                  <button
                    onClick={() => handleSaveName(person._id, newPersonName)}
                    style={{
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      backgroundColor: '#000000',
                      color: '#ffffff',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    ✓
                  </button>
                  <button
                    onClick={handleCancelNameEdit}
                    style={{
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      backgroundColor: '#ffffff',
                      color: '#000000',
                      border: '2px solid #000000',
                      cursor: 'pointer'
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div style={{ 
                  fontSize: '16px', 
                  fontWeight: 'bold',
                  marginBottom: '8px'
                }}>
                  {person.name}
                </div>
              )}
              
              {Object.entries(person.properties || {}).map(([key, value]) => (
                <div key={key} style={{ 
                  fontSize: '12px',
                  marginBottom: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>{getPropertyDisplayName(key)}:</span>
                  <div 
                    style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid #000000',
                      backgroundColor: value ? '#000000' : '#ffffff',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      fontSize: '10px',
                      color: value ? '#ffffff' : '#000000',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                    onClick={(e) => {
                      e.stopPropagation() // Prevent opening person page
                      handlePropertyToggle(person._id, key, value)
                    }}
                  >
                    {value ? '✓' : ''}
                  </div>
                </div>
              ))}
            </div>
          ))}
          
          {/* Add Person Button integrated into the list */}
          <div
            style={{
              border: '2px dashed #000000',
              padding: '32px 16px',
              backgroundColor: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '80px'
            }}
            onClick={handleAddPerson}
          >
            <div style={{ 
              fontSize: '24px', 
              fontWeight: 'bold',
              marginBottom: '8px',
              color: '#000000'
            }}>
              +
            </div>
            <div style={{ 
              fontSize: '14px', 
              fontWeight: 'bold',
              color: '#000000'
            }}>
              ADD PERSON
            </div>
          </div>
        </div>
      )}



      </div>
  )
}

function PersonPage({ 
  person, 
  allPropertyKeys, 
  getPropertyDisplayName,
  addingProperty,
  newPropertyName,
  onPropertyToggle, 
  onStartAddProperty,
  onAddProperty,
  onCancelAddProperty,
  onPropertyNameChange,
  onRemoveProperty,
  onUpdateName,
  onUpdateAvailability,
  onOpenRepeat,
  weekOffset,
  onWeekOffsetChange, 
  onBack, 
  onDelete,
  addRepeatPattern,
  removeRepeatPattern,
  addRepeatException,
  stopFutureRepeats,
  clearRepeatExceptions 
}: {
  person: Person;
  allPropertyKeys: string[];
  getPropertyDisplayName: (key: string) => string;
  addingProperty: boolean;
  newPropertyName: string;
  onPropertyToggle: (personId: string, propertyKey: string, currentValue: boolean) => void;
  onStartAddProperty: () => void;
  onAddProperty: () => void;
  onCancelAddProperty: () => void;
  onPropertyNameChange: (name: string) => void;
  onRemoveProperty: (propertyKey: string) => void;
  onUpdateName: (personId: string, name: string) => Promise<void>;
  onUpdateAvailability: (personId: string, date: string, unavailable: boolean, startTime?: string, endTime?: string) => Promise<void>;
  onOpenRepeat: (personId: string, date: string, availability: { unavailable: boolean; startTime?: string; endTime?: string }) => void;
  weekOffset: number;
  onWeekOffsetChange: (offset: number) => void;
  onBack: () => void;
  onDelete: () => void;
  addRepeatPattern: any;
  removeRepeatPattern: any;
  addRepeatException: any;
  stopFutureRepeats: any;
  clearRepeatExceptions: any;
}) {
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(person.name)
  const [repeatPopup, setRepeatPopup] = useState<{
    open: boolean;
    personId: string;
    date: string;
    availability: { unavailable: boolean; startTime?: string; endTime?: string };
  } | null>(null)

  const [unrepeatPopup, setUnrepeatPopup] = useState<{
    open: boolean;
    personId: string;
    startDate: string;
  } | null>(null)

  const [removeRepeatPopup, setRemoveRepeatPopup] = useState<{
    open: boolean;
    personId: string;
    date: string;
  } | null>(null)

  // Update name value when person changes
  useEffect(() => {
    setNameValue(person.name)
  }, [person.name])

  const handleApplyRepeat = async (personId: string, startDate: string, availability: { unavailable: boolean; startTime?: string; endTime?: string }, repeatEvery: number, repeatUnit: 'day' | 'week' | 'month', enableRepeat: boolean) => {
    console.log('handleApplyRepeat called:', { 
      personId, 
      startDate, 
      availability, 
      repeatEvery, 
      repeatUnit, 
      enableRepeat,
      existingPatterns: person.repeatPatterns ? Object.keys(person.repeatPatterns) : []
    });
    
    if (enableRepeat) {
      // Store the repeat pattern
      console.log('Creating repeat pattern:', { personId, startDate, availability, repeatEvery, repeatUnit });
      try {
        await addRepeatPattern({
          id: personId as any,
          startDate,
          every: repeatEvery,
          unit: repeatUnit,
          unavailable: availability.unavailable,
          startTime: availability.startTime,
          endTime: availability.endTime
        });
        console.log('Successfully created repeat pattern for date:', startDate);
      } catch (error) {
        console.error('Failed to create repeat pattern:', error);
      }
    } else {
      console.log('Not creating repeat pattern - checkbox not enabled');
    }
    
    // Always call the existing update function to ensure the start date is set
    console.log('Updating availability for start date:', startDate);
    await onUpdateAvailability(personId, startDate, availability.unavailable, availability.startTime, availability.endTime);
    
    setRepeatPopup(null);
  }

  const handleSaveName = async () => {
    if (nameValue.trim() && nameValue.trim() !== person.name) {
      await onUpdateName(person._id, nameValue.trim())
    }
    setEditingName(false)
  }

  return (
      <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <button
            onClick={onBack}
            style={{
              fontSize: '28px',
              fontWeight: '900',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            ←
          </button>
          {editingName ? (
            <div style={{ display: 'flex', gap: '8px', flex: 1, alignItems: 'center' }}>
              <input
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: '2px solid #000000',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  fontFamily: 'inherit',
                  backgroundColor: '#ffffff'
                }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveName()
                  } else if (e.key === 'Escape') {
                    setNameValue(person.name)
                    setEditingName(false)
                  }
                }}
              />
              <button
                onClick={handleSaveName}
                style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  backgroundColor: '#000000',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                ✓
              </button>
              <button
                onClick={() => {
                  setNameValue(person.name)
                  setEditingName(false)
                }}
                style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  border: '2px solid #000000',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>
          ) : (
            <h2 
              style={{ 
                fontSize: '20px', 
                fontWeight: 'bold', 
                margin: 0, 
                cursor: 'pointer',
                flex: 1,
                padding: '8px'
              }}
              onClick={() => setEditingName(true)}
            >
              {person.name}
            </h2>
          )}
        </div>
      </div>



      {/* Properties */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ 
          fontSize: '12px', 
          fontWeight: 'bold', 
          marginBottom: '8px'
        }}>
          PROPERTIES:
        </div>
        <div style={{ display: 'grid', gap: '8px' }}>
          {allPropertyKeys.map((key) => (
            <div
              key={key}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px',
                border: '2px solid #000000'
              }}
            >
              <span style={{ fontSize: '14px', flex: 1 }}>
                {getPropertyDisplayName(key)}
              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      border: '2px solid #000000',
                      backgroundColor: person.properties[key] ? '#000000' : '#ffffff',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      fontSize: '12px',
                      color: person.properties[key] ? '#ffffff' : '#000000',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                    onClick={() => onPropertyToggle(
                      person._id, 
                      key, 
                      person.properties[key] || false
                    )}
                  >
                    {person.properties[key] ? '✓' : ''}
                  </div>
                <button
                  onClick={() => onRemoveProperty(key)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    border: '1px solid #000000',
                    cursor: 'pointer'
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          
          {/* Add Property Section */}
          {addingProperty ? (
            <div style={{
              padding: '12px',
              border: '2px solid #000000',
              backgroundColor: '#ffffff'
            }}>
              <input
                type="text"
                value={newPropertyName}
                onChange={(e) => onPropertyNameChange(e.target.value)}
                placeholder="Property name (e.g., זמין בלילות)..."
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '2px solid #000000',
                  fontSize: '14px',
                  marginBottom: '8px',
                  fontFamily: 'inherit'
                }}
                dir="auto"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newPropertyName.trim()) {
                    onAddProperty()
                  } else if (e.key === 'Escape') {
                    onCancelAddProperty()
                  }
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={onAddProperty}
                  disabled={!newPropertyName.trim()}
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    backgroundColor: newPropertyName.trim() ? '#000000' : '#cccccc',
                    color: '#ffffff',
                    border: 'none',
                    cursor: newPropertyName.trim() ? 'pointer' : 'not-allowed'
                  }}
                >
                  ADD
                </button>
                <button
                  onClick={onCancelAddProperty}
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    border: '2px solid #000000',
                    cursor: 'pointer'
                  }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '20px 12px',
                border: '2px dashed #000000',
                cursor: 'pointer',
                backgroundColor: '#ffffff'
              }}
              onClick={onStartAddProperty}
            >
              <span style={{ 
                fontSize: '14px', 
                fontWeight: 'bold',
                color: '#000000'
              }}>
                + ADD NEW PROPERTY
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Calendar Section */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ 
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <button
            onClick={() => onWeekOffsetChange(weekOffset - 1)}
            style={{
              fontSize: '28px',
              fontWeight: '900',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 8px'
            }}
          >
            ←
          </button>
          
          <div style={{ 
            fontSize: '14px', 
            fontWeight: 'bold',
            textAlign: 'center'
          }}>
            ABSENCE
          </div>
          
          <button
            onClick={() => onWeekOffsetChange(weekOffset + 1)}
            style={{
              fontSize: '28px',
              fontWeight: '900',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 8px'
            }}
          >
            →
          </button>
        </div>
        
        <CalendarGrid 
          person={person}
          weekOffset={weekOffset}
          onUpdateAvailability={onUpdateAvailability}
          onOpenRepeat={(personId, date, availability) => {
            console.log('Setting repeat popup state in PersonPage:', { personId, date, availability });
            console.log('Current person state when opening repeat popup:', {
              personId,
              hasRepeatPatterns: !!person.repeatPatterns,
              repeatPatternKeys: person.repeatPatterns ? Object.keys(person.repeatPatterns) : [],
              directAvailability: person.availability ? person.availability[date] : undefined,
              repeatExceptions: person.repeatExceptions || []
            });
            setRepeatPopup({ open: true, personId, date, availability });
          }}
          onCancelRepeat={async (personId, date) => {
            console.log('Canceling repeat for date:', date);
            // Add this date to exceptions to cancel just this instance
            await addRepeatException({ id: personId as any, date });
          }}
          onUnrepeat={(personId, startDate) => {
            console.log('Opening unrepeat popup for pattern starting from date:', startDate);
            // Open popup to choose when to stop repeats
            setUnrepeatPopup({ open: true, personId, startDate });
          }}
          onOpenRemoveRepeat={(personId, date) => {
            console.log('Opening remove repeat popup for date:', date);
            setRemoveRepeatPopup({ open: true, personId, date });
          }}
        />
      </div>

      {/* Delete Button */}
      <button
        onClick={onDelete}
        style={{
          width: '100%',
          padding: '12px',
          fontSize: '14px',
          fontWeight: 'bold',
          backgroundColor: '#ffffff',
          color: '#000000',
          border: '2px solid #000000',
          cursor: 'pointer'
        }}
      >
        DELETE PERSON
        </button>

        {/* Repeat Popup */}
        {repeatPopup?.open && (
          <RepeatPopup
            personId={repeatPopup.personId}
            date={repeatPopup.date}
            availability={repeatPopup.availability}
            onApply={handleApplyRepeat}
            onClose={() => {
              console.log('Closing repeat popup');
              setRepeatPopup(null);
            }}
          />
        )}

        {/* Remove Repeat Popup */}
        {removeRepeatPopup?.open && (
          <RemoveRepeatPopup
            personId={removeRepeatPopup.personId}
            date={removeRepeatPopup.date}
            onRemoveOne={(personId, date) => {
              console.log('Removing only this date (adding exception):', date);
              
              // Find the pattern this date belongs to for debugging
              const patternStartDate = person.repeatPatterns ? Object.keys(person.repeatPatterns).find(startDate => 
                matchesRepeatPattern(date, startDate, person.repeatPatterns![startDate])
              ) : null;
              
              console.log('Adding exception for date:', date, 'from pattern:', patternStartDate);
              addRepeatException({ id: personId as any, date });
              setRemoveRepeatPopup(null);
            }}
            onRemoveAllFollowing={(personId, date) => {
              console.log('Removing this date and all following:', date);
              
              // Find the pattern this date belongs to
              const patternStartDate = person.repeatPatterns ? Object.keys(person.repeatPatterns).find(startDate => 
                matchesRepeatPattern(date, startDate, person.repeatPatterns![startDate])
              ) : null;
              
              console.log('Pattern analysis:', {
                date,
                patternStartDate,
                isOriginalDate: date === patternStartDate
              });
              
              if (patternStartDate) {
                if (date === patternStartDate) {
                  // Removing from original date = delete entire pattern
                  console.log('Deleting entire pattern starting from:', patternStartDate);
                  removeRepeatPattern({ id: personId as any, startDate: patternStartDate });
                } else {
                  // Removing from repeated instance = stop future repeats from this date
                  console.log('Stopping future repeats from:', date);
                  stopFutureRepeats({ 
                    id: personId as any, 
                    startDate: patternStartDate,
                    customStopFromDate: date
                  });
                }
              }
              
              setRemoveRepeatPopup(null);
            }}
            onClose={() => {
              console.log('Closing remove repeat popup');
              setRemoveRepeatPopup(null);
            }}
          />
        )}

    </div>
  )
}

function MissionTab() {
  const [showingMissionPage, setShowingMissionPage] = useState<Mission | null>(null);
  const [editingMissionName, setEditingMissionName] = useState<string | null>(null);
  const [newMissionName, setNewMissionName] = useState('');

  // Mission-related hooks
  const missions = useQuery(api.people.listMissions) as Mission[] | undefined
  const addMission = useMutation(api.people.addMission)
  const updateMissionName = useMutation(api.people.updateMissionName)
  const updateMissionPropertyFilter = useMutation(api.people.updateMissionPropertyFilter)
  const removeMissionPropertyFilter = useMutation(api.people.removeMissionPropertyFilter)
  const updateMissionSchedule = useMutation(api.people.updateMissionSchedule)
  const addMissionRepeatPattern = useMutation(api.people.addMissionRepeatPattern)
  const removeMissionRepeatPattern = useMutation(api.people.removeMissionRepeatPattern)
  const addMissionRepeatException = useMutation(api.people.addMissionRepeatException)
  const stopFutureMissionRepeats = useMutation(api.people.stopFutureMissionRepeats)
  const removeMission = useMutation(api.people.removeMission)

  // Also need people data for filtering
  const people = useQuery(api.people.list) as Person[] | undefined

  // Auto-start editing when a new mission with empty name is detected
  useEffect(() => {
    if (missions) {
      const emptyMission = missions.find(m => m.name === "new mission")
      if (emptyMission && editingMissionName !== emptyMission._id) {
        setEditingMissionName(emptyMission._id)
        setNewMissionName('')
      }
    }
  }, [missions, editingMissionName])

  const handleAddMission = async () => {
    const result = await addMission({ name: "new mission" });
    console.log('Mission created:', result);
  }

  const handleSaveMissionName = async () => {
    if (!editingMissionName) return;
    
    const trimmedName = newMissionName.trim();
    
    // If empty name, cancel the edit
    if (!trimmedName) {
      handleCancelMissionEdit();
      return;
    }
    
    // Check if name already exists
    const nameExists = missions?.some(m => 
      m.name.toLowerCase() === trimmedName.toLowerCase() && 
      m._id !== editingMissionName
    );
    
    if (nameExists) {
      alert('A mission with this name already exists. Please choose a different name.');
      return;
    }
    
    await updateMissionName({ id: editingMissionName as any, name: trimmedName });
    setEditingMissionName(null);
    setNewMissionName('');
  }

  const handleCancelMissionEdit = async () => {
    if (editingMissionName) {
      // If the mission name is still "new mission", delete it
      const mission = missions?.find(m => m._id === editingMissionName);
      if (mission && mission.name === "new mission") {
        await removeMission({ id: editingMissionName as any });
      }
      setEditingMissionName(null);
      setNewMissionName('');
    }
  }

  // If showing mission page, render that instead
  if (showingMissionPage) {
    // Find the current version of the mission from the live query
    const currentMission = missions?.find(m => m._id === showingMissionPage._id)
    
    if (!currentMission) {
      // Mission was deleted, go back to list
      setShowingMissionPage(null)
      return null
    }

    return <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
        <button 
          onClick={() => setShowingMissionPage(null)}
          style={{
            fontSize: '24px',
            fontWeight: 'bold',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            marginRight: '20px'
          }}
        >
          ←
        </button>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
          EDIT MISSION
        </h2>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          value={currentMission.name}
          onChange={(e) => {
            const newName = e.target.value;
            // Only update if it's not empty and doesn't already exist
            if (newName.trim()) {
              const nameExists = missions?.some(m => 
                m.name.toLowerCase() === newName.trim().toLowerCase() && 
                m._id !== currentMission._id
              );
              
              if (!nameExists) {
                updateMissionName({ id: currentMission._id as any, name: newName.trim() });
              }
            }
          }}
          onBlur={(e) => {
            const newName = e.target.value;
            if (!newName.trim()) {
              // If empty, revert to previous name or delete if it was "new mission"
              if (currentMission.name === "new mission") {
                removeMission({ id: currentMission._id as any });
                setShowingMissionPage(null);
              } else {
                // Revert to previous name - this will be handled by the live query
              }
            }
          }}
          style={{
            fontSize: '18px',
            fontWeight: 'bold',
            padding: '8px',
            border: '2px solid #000000',
            backgroundColor: '#ffffff',
            width: '100%'
          }}
        />
      </div>
      
      {/* Property Filters Section */}
      <div style={{ marginBottom: '30px' }}>
        <div style={{
          fontSize: '16px',
          fontWeight: 'bold',
          marginBottom: '12px'
        }}>
          PROPERTY FILTERS:
        </div>
        
        <div style={{ display: 'grid', gap: '8px', marginBottom: '12px' }}>
          {Object.keys(currentMission.propertyFilters || {}).map((propertyKey) => {
            const filter = currentMission.propertyFilters[propertyKey];
            const propertyDisplayName = people?.[0]?.propertyNames?.[propertyKey] || propertyKey;
            
            return (
              <div
                key={propertyKey}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  border: '2px solid #000000',
                  backgroundColor: '#ffffff'
                }}
              >
                <span style={{ fontSize: '14px', flex: 1 }}>
                  {propertyDisplayName}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* WITH/WITHOUT toggle */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => updateMissionPropertyFilter({ 
                        id: currentMission._id as any, 
                        propertyKey, 
                        required: true, 
                        value: filter.value 
                      })}
                      style={{
                        padding: '4px 8px',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        backgroundColor: filter.required ? '#000000' : '#ffffff',
                        color: filter.required ? '#ffffff' : '#000000',
                        border: '1px solid #000000',
                        cursor: 'pointer'
                      }}
                    >
                      WITH
                    </button>
                    <button
                      onClick={() => updateMissionPropertyFilter({ 
                        id: currentMission._id as any, 
                        propertyKey, 
                        required: false, 
                        value: filter.value 
                      })}
                      style={{
                        padding: '4px 8px',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        backgroundColor: !filter.required ? '#000000' : '#ffffff',
                        color: !filter.required ? '#ffffff' : '#000000',
                        border: '1px solid #000000',
                        cursor: 'pointer'
                      }}
                    >
                      WITHOUT
                    </button>
                  </div>
                  
                  {/* TRUE/FALSE checkbox */}
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      border: '2px solid #000000',
                      backgroundColor: filter.value ? '#000000' : '#ffffff',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      fontSize: '12px',
                      color: filter.value ? '#ffffff' : '#000000',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                    onClick={() => updateMissionPropertyFilter({ 
                      id: currentMission._id as any, 
                      propertyKey, 
                      required: filter.required, 
                      value: !filter.value 
                    })}
                  >
                    {filter.value ? '✓' : ''}
                  </div>
                  
                  {/* Remove filter button */}
                  <button
                    onClick={() => removeMissionPropertyFilter({ 
                      id: currentMission._id as any, 
                      propertyKey 
                    })}
                    style={{
                      padding: '4px 8px',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      backgroundColor: '#ffffff',
                      color: '#000000',
                      border: '1px solid #000000',
                      cursor: 'pointer'
                    }}
                  >
                    REMOVE
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Add Property Filter Dropdown */}
        {people && people.length > 0 && (
          <select
            onChange={(e) => {
              const propertyKey = e.target.value;
              if (propertyKey && !currentMission.propertyFilters[propertyKey]) {
                updateMissionPropertyFilter({ 
                  id: currentMission._id as any, 
                  propertyKey, 
                  required: true, 
                  value: true 
                });
              }
              e.target.value = ''; // Reset selection
            }}
            style={{
              width: '100%',
              padding: '8px',
              fontSize: '14px',
              border: '2px solid #000000',
              backgroundColor: '#ffffff',
              cursor: 'pointer'
            }}
          >
            <option value="">+ ADD PROPERTY FILTER</option>
            {Object.keys(people[0]?.properties || {}).filter(key => 
              !currentMission.propertyFilters[key]
            ).map(propertyKey => {
              const displayName = people[0]?.propertyNames?.[propertyKey] || propertyKey;
              return (
                <option key={propertyKey} value={propertyKey}>
                  {displayName}
                </option>
              );
            })}
          </select>
        )}
      </div>

      {/* Compatible People List */}
      <div style={{ marginBottom: '30px' }}>
        <div style={{
          fontSize: '16px',
          fontWeight: 'bold',
          marginBottom: '12px'
        }}>
          COMPATIBLE PEOPLE:
        </div>
        
        <div style={{ display: 'grid', gap: '8px' }}>
          {(() => {
            // Filter people based on mission property filters
            const compatiblePeople = people?.filter(person => {
              // If no filters, everyone is compatible
              if (!currentMission.propertyFilters || Object.keys(currentMission.propertyFilters).length === 0) {
                return true;
              }
              
              // Check each filter
              return Object.entries(currentMission.propertyFilters).every(([propertyKey, filter]) => {
                const personHasProperty = person.properties[propertyKey] === true;
                
                if (filter.required) {
                  // Person must HAVE the property
                  if (filter.value) {
                    // Property should be true
                    return personHasProperty;
                  } else {
                    // Property should be false
                    return !personHasProperty;
                  }
                } else {
                  // Person must NOT have the property
                  if (filter.value) {
                    // Should NOT have property as true
                    return !personHasProperty;
                  } else {
                    // Should NOT have property as false (meaning they DO have it as true)
                    return personHasProperty;
                  }
                }
              });
            }) || [];

            if (compatiblePeople.length === 0) {
              return (
                <div style={{
                  padding: '16px',
                  border: '2px solid #000000',
                  backgroundColor: '#f5f5f5',
                  textAlign: 'center',
                  fontSize: '14px',
                  color: '#666666'
                }}>
                  {people && people.length > 0 
                    ? 'No people match the current filters' 
                    : 'No people available'
                  }
                </div>
              );
            }

            return compatiblePeople.map(person => (
              <div
                key={person._id}
                style={{
                  padding: '12px',
                  border: '2px solid #000000',
                  backgroundColor: '#ffffff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontSize: '14px', fontWeight: 'bold' }}>
                  {person.name}
                </span>
                <div style={{ display: 'flex', gap: '8px', fontSize: '10px' }}>
                  {Object.entries(currentMission.propertyFilters || {}).map(([propertyKey, filter]) => {
                    const propertyDisplayName = people?.[0]?.propertyNames?.[propertyKey] || propertyKey;
                    const personHasProperty = person.properties[propertyKey] === true;
                    const matchesFilter = filter.required 
                      ? (filter.value ? personHasProperty : !personHasProperty)
                      : (filter.value ? !personHasProperty : personHasProperty);
                    
                    return (
                      <span
                        key={propertyKey}
                        style={{
                          padding: '2px 6px',
                          backgroundColor: matchesFilter ? '#e8f5e8' : '#ffe8e8',
                          border: '1px solid ' + (matchesFilter ? '#4CAF50' : '#f44336'),
                          borderRadius: '3px',
                          fontSize: '10px'
                        }}
                        title={`${propertyDisplayName}: ${filter.required ? 'WITH' : 'WITHOUT'} ${filter.value ? 'TRUE' : 'FALSE'}`}
                      >
                        {propertyDisplayName.slice(0, 8)}...
                      </span>
                    );
                  })}
                </div>
              </div>
            ));
          })()}
        </div>
      </div>

      {/* Mission Calendar */}
      <div style={{ marginBottom: '30px' }}>
        <div style={{
          fontSize: '16px',
          fontWeight: 'bold',
          marginBottom: '12px'
        }}>
          MISSION SCHEDULE:
        </div>
        
        <MissionCalendarGrid
          mission={currentMission}
          onUpdateSchedule={updateMissionSchedule}
          onAddRepeatPattern={addMissionRepeatPattern}
          onRemoveRepeatPattern={removeMissionRepeatPattern}
          onAddRepeatException={addMissionRepeatException}
          onStopFutureRepeats={stopFutureMissionRepeats}
        />
      </div>
      
      <button
        onClick={() => removeMission({ id: currentMission._id as any })}
        style={{
          width: '100%',
          padding: '12px',
          fontSize: '14px',
          fontWeight: 'bold',
          backgroundColor: '#ffffff',
          color: '#000000',
          border: '2px solid #000000',
          cursor: 'pointer'
        }}
      >
        DELETE MISSION
      </button>
    </div>
  }

  return (
    <div>
      <h2 style={{ 
        fontSize: '20px', 
        fontWeight: 'bold', 
        marginBottom: '20px',
        color: '#000000'
      }}>
        MISSIONS
      </h2>
      
      <div style={{ display: 'grid', gap: '12px' }}>
        {missions?.map((mission) => (
          <div
            key={mission._id}
            style={{
              padding: '16px',
              border: '2px solid #000000',
              backgroundColor: '#ffffff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            {editingMissionName === mission._id ? (
              <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                <input
                  type="text"
                  value={newMissionName}
                  onChange={(e) => setNewMissionName(e.target.value)}
                  placeholder="new mission"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveMissionName();
                    } else if (e.key === 'Escape') {
                      handleCancelMissionEdit();
                    }
                  }}
                                     onBlur={() => {
                     // Small delay to allow onClick events to fire first
                     setTimeout(() => {
                       if (newMissionName.trim()) {
                         handleSaveMissionName();
                       } else {
                         handleCancelMissionEdit();
                       }
                     }, 100);
                   }}
                  autoFocus
                  style={{
                    fontSize: '16px',
                    fontWeight: 'bold',
                    padding: '4px',
                    border: '1px solid #000000',
                    backgroundColor: '#ffffff',
                    flex: 1
                  }}
                />
              </div>
            ) : (
              <>
                <span 
                  style={{ 
                    fontSize: '16px', 
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    flex: 1
                  }}
                  onClick={() => setShowingMissionPage(mission)}
                >
                  {mission.name}
                </span>
                <span style={{ fontSize: '12px', color: '#666666' }}>
                  {Object.keys(mission.propertyFilters || {}).length} filters
                </span>
              </>
            )}
          </div>
        ))}
        
        {/* Add Mission Button */}
        <button
          onClick={handleAddMission}
          style={{
            padding: '20px',
            fontSize: '16px',
            fontWeight: 'bold',
            backgroundColor: '#ffffff',
            color: '#000000',
            border: '2px solid #000000',
            cursor: 'pointer',
            textAlign: 'center'
          }}
        >
          + ADD MISSION
        </button>
      </div>
    </div>
  )
}

function RulesTab() {
  return (
    <div>
      <h2 style={{ 
        fontSize: '20px', 
        fontWeight: 'bold', 
        marginBottom: '20px',
        color: '#000000'
      }}>
        RULES
      </h2>
      <div style={{ 
        height: '200px', 
        border: '2px solid #000000',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: '14px',
        fontWeight: 'bold'
      }}>
        COMING SOON
      </div>
    </div>
  )
}

function CalendarTab() {
  return (
    <div>
      <h2 style={{ 
        fontSize: '20px', 
        fontWeight: 'bold', 
        marginBottom: '20px',
        color: '#000000'
      }}>
        CALENDAR
      </h2>
      <div style={{ 
        height: '200px', 
        border: '2px solid #000000',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: '14px',
        fontWeight: 'bold'
      }}>
        COMING SOON
      </div>
    </div>
  )
}

// Helper function to check if a date matches a mission repeat pattern
function matchesMissionRepeatPattern(date: string, startDate: string, pattern: { every: number; unit: 'day' | 'week' | 'month' }): boolean {
  const targetDate = new Date(date + 'T00:00:00');
  const patternStartDate = new Date(startDate + 'T00:00:00');
  
  if (targetDate <= patternStartDate) return false;
  
  const diffTime = targetDate.getTime() - patternStartDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (pattern.unit === 'day') {
    return diffDays % pattern.every === 0;
  } else if (pattern.unit === 'week') {
    return diffDays % (pattern.every * 7) === 0;
  } else if (pattern.unit === 'month') {
    // For monthly repeats, check if it's the same day of month
    const targetDay = targetDate.getDate();
    const startDay = patternStartDate.getDate();
    if (targetDay !== startDay) return false;
    
    const monthDiff = (targetDate.getFullYear() - patternStartDate.getFullYear()) * 12 + 
                     (targetDate.getMonth() - patternStartDate.getMonth());
    return monthDiff % pattern.every === 0;
  }
  
  return false;
}

// Helper function to get effective mission schedule for a date (including repeats)
function getEffectiveMissionSchedule(mission: Mission, date: string): { scheduled: boolean; startTime?: string; endTime?: string; isRepeated?: boolean; isRepeatOrigin?: boolean; isResetOrigin?: boolean; originalStartDate?: string; futureRepeatsStopped?: boolean; wasBrokenFromPattern?: boolean } | undefined {
  // Check if this date is the origin of a repeat pattern
  const isRepeatOrigin = mission.repeatPatterns && mission.repeatPatterns[date];
  
  console.log('getEffectiveMissionSchedule called for date:', date, {
    hasDirectSchedule: !!mission.schedule[date],
    isRepeatOrigin: !!isRepeatOrigin,
    directSchedule: mission.schedule[date],
    repeatPatterns: mission.repeatPatterns ? Object.keys(mission.repeatPatterns) : [],
    repeatExceptions: mission.repeatExceptions || [],
    isThisDateInExceptions: mission.repeatExceptions?.includes(date)
  });
  
  // PRIORITY 1: Direct schedule for repeat origins (reset case)
  // If this is a repeat origin with direct schedule, it means it was reset
  if (isRepeatOrigin && mission.schedule[date]) {
    const result = {
      ...mission.schedule[date],
      isRepeated: false, // Reset origins are not "repeated"
      isRepeatOrigin: true,
      isResetOrigin: true, // NEW FLAG: This origin was reset
      originalStartDate: date,
      futureRepeatsStopped: hasFutureMissionRepeatsStopped(mission, date),
      wasBrokenFromPattern: false
    };
    
    console.log('Returning RESET original mission cell for date:', date, result);
    return result;
  }
  
  // PRIORITY 2: Direct schedule for non-pattern dates (broken from pattern)
  if (mission.schedule[date] && !isRepeatOrigin) {
    // Check if this date was originally part of a pattern but now broken
    let wasBrokenFromPattern = false;
    if (mission.repeatPatterns) {
      for (const [startDate, pattern] of Object.entries(mission.repeatPatterns)) {
        if (matchesMissionRepeatPattern(date, startDate, pattern)) {
          wasBrokenFromPattern = true;
          break;
        }
      }
    }
    
    const result = {
      ...mission.schedule[date],
      isRepeated: false, // Direct schedule is never considered "repeated"
      isRepeatOrigin: false,
      isResetOrigin: false, // Not a reset origin
      originalStartDate: undefined,
      futureRepeatsStopped: false,
      wasBrokenFromPattern
    };
    
    console.log('Returning direct schedule for broken-from-pattern date:', date, result);
    return result;
  }

  // PRIORITY 3: Check if date is in exceptions (canceled repeats)
  // BUT: if the date also has direct schedule, prioritize that (user manually set it)
  if (mission.repeatExceptions?.includes(date) && !mission.schedule[date]) {
    console.log('Date is in exceptions (canceled repeat) and has no direct schedule:', date);
    return undefined;
  }
  
  if (mission.repeatExceptions?.includes(date) && mission.schedule[date]) {
    console.log('Date is in exceptions BUT has direct schedule (user override):', date);
    // Continue to pattern checking - don't return undefined
  }
  
  // PRIORITY 4: Check repeat patterns (including original dates without reset)
  if (mission.repeatPatterns) {
    console.log('Checking repeat patterns for date:', date, 'patterns:', Object.keys(mission.repeatPatterns));
    for (const [startDate, pattern] of Object.entries(mission.repeatPatterns)) {
      if (matchesMissionRepeatPattern(date, startDate, pattern)) {
        // Check if this is the original date or a repeated instance
        const isThisTheOrigin = date === startDate;
        
        const result = {
          scheduled: pattern.scheduled,
          // Keep FULL day as empty strings, don't convert to specific times
          startTime: pattern.startTime || '',
          endTime: pattern.endTime || '',
          isRepeated: !isThisTheOrigin, // Only repeated instances are marked as "repeated"
          isRepeatOrigin: isThisTheOrigin,
          isResetOrigin: false, // Pattern-derived schedule is never reset
          originalStartDate: startDate,
          futureRepeatsStopped: hasFutureMissionRepeatsStopped(mission, startDate),
          wasBrokenFromPattern: false
        };
        
        if (isThisTheOrigin) {
          console.log('Returning ORIGINAL mission pattern cell for date:', date, result);
        } else {
          console.log('Returning REPEATED mission instance for date:', date, 'from pattern:', startDate, result);
        }
        return result;
      }
    }
  }
  
  console.log('No schedule found for date:', date, 'returning undefined');
  return undefined;
}

// Helper function to check if a mission pattern has future repeats stopped
function hasFutureMissionRepeatsStopped(mission: Mission, startDate: string): boolean {
  if (!mission.repeatPatterns || !mission.repeatPatterns[startDate] || !mission.repeatExceptions) {
    return false;
  }
  
  const pattern = mission.repeatPatterns[startDate];
  const today = new Date().toISOString().split('T')[0];
  const todayDate = new Date(today + 'T00:00:00');
  const patternStartDate = new Date(startDate + 'T00:00:00');
  
  // Check if there's at least one future exception that matches this pattern
  for (const exceptionDate of mission.repeatExceptions) {
    const exceptionDateObj = new Date(exceptionDate + 'T00:00:00');
    
    // Only check future dates
    if (exceptionDateObj > todayDate) {
      const diffTime = exceptionDateObj.getTime() - patternStartDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 0) {
        let matches = false;
        if (pattern.unit === 'day') {
          matches = diffDays % pattern.every === 0;
        } else if (pattern.unit === 'week') {
          matches = diffDays % (pattern.every * 7) === 0;
        } else if (pattern.unit === 'month') {
          const targetDay = exceptionDateObj.getDate();
          const startDay = patternStartDate.getDate();
          if (targetDay === startDay) {
            const monthDiff = (exceptionDateObj.getFullYear() - patternStartDate.getFullYear()) * 12 + 
                             (exceptionDateObj.getMonth() - patternStartDate.getMonth());
            matches = monthDiff % pattern.every === 0;
          }
        }
        
        if (matches) {
          return true; // Found at least one future exception
        }
      }
    }
  }
  
  return false;
}

// Mission Calendar Component
function MissionCalendarGrid({ 
  mission,
  onUpdateSchedule,
  onAddRepeatPattern,
  onRemoveRepeatPattern,
  onAddRepeatException,
  onStopFutureRepeats
}: {
  mission: Mission;
  onUpdateSchedule: any;
  onAddRepeatPattern: any;
  onRemoveRepeatPattern: any;
  onAddRepeatException: any;
  onStopFutureRepeats: any;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [repeatPopup, setRepeatPopup] = useState<{
    open: boolean;
    missionId: string;
    date: string;
    schedule: { scheduled: boolean; startTime?: string; endTime?: string };
  } | null>(null);
  const [removeRepeatPopup, setRemoveRepeatPopup] = useState<{
    open: boolean;
    missionId: string;
    date: string;
  } | null>(null);

  const { weekNumbers, dates } = getThreeWeeks(weekOffset);
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  const handleApplyRepeat = async (missionId: string, startDate: string, schedule: { scheduled: boolean; startTime?: string; endTime?: string }, repeatEvery: number, repeatUnit: 'day' | 'week' | 'month', enableRepeat: boolean) => {
    console.log('handleApplyRepeat called:', { 
      missionId, 
      startDate, 
      schedule, 
      repeatEvery, 
      repeatUnit, 
      enableRepeat,
      existingPatterns: mission.repeatPatterns ? Object.keys(mission.repeatPatterns) : []
    });
    
    if (enableRepeat) {
      // Store the repeat pattern
      console.log('Creating mission repeat pattern:', { missionId, startDate, schedule, repeatEvery, repeatUnit });
      try {
        await onAddRepeatPattern({
          id: missionId as any,
          startDate,
          every: repeatEvery,
          unit: repeatUnit,
          scheduled: schedule.scheduled,
          startTime: schedule.startTime,
          endTime: schedule.endTime
        });
        console.log('Successfully created mission repeat pattern for date:', startDate);
      } catch (error) {
        console.error('Failed to create mission repeat pattern:', error);
      }
    } else {
      console.log('Not creating mission repeat pattern - checkbox not enabled');
    }
    
    // Always call the existing update function to ensure the start date is set
    console.log('Updating mission schedule for start date:', startDate);
    await onUpdateSchedule({
      id: missionId,
      date: startDate,
      scheduled: schedule.scheduled,
      startTime: schedule.startTime,
      endTime: schedule.endTime
    });
    
    setRepeatPopup(null);
  };

  return (
    <div>
      {/* Navigation */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '12px' 
      }}>
        <button
          onClick={() => setWeekOffset(weekOffset - 1)}
          style={{
            fontSize: '20px',
            fontWeight: 'bold',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          ←
        </button>
        
        <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
          MISSION SCHEDULE
        </div>
        
        <button
          onClick={() => setWeekOffset(weekOffset + 1)}
          style={{
            fontSize: '20px',
            fontWeight: 'bold',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          →
        </button>
      </div>

      {/* Calendar Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '50px repeat(3, 1fr)',
        gap: '1px',
        border: '2px solid #000000',
        backgroundColor: '#000000'
      }}>
        {/* Header row - week numbers */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '8px 4px',
          fontSize: '10px',
          fontWeight: 'bold',
          textAlign: 'center'
        }}>
          WEEK
        </div>
        
        {weekNumbers.map((weekNum) => (
          <div
            key={weekNum}
            style={{
              backgroundColor: '#ffffff',
              padding: '8px 4px',
              fontSize: '10px',
              fontWeight: 'bold',
              textAlign: 'center'
            }}
          >
            {weekNum}
          </div>
        ))}

        {/* Calendar rows - one for each day of the week */}
        {dayNames.map((dayName, dayIndex) => (
          <>
            {/* Day name in first column */}
            <div
              key={`day-${dayName}`}
              style={{
                backgroundColor: '#ffffff',
                padding: '4px',
                fontSize: '10px',
                fontWeight: 'bold',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {dayName}
            </div>
            
            {/* Days for this day of week across the 3 weeks */}
            {dates.map((week, weekIndex) => {
              const date = week[dayIndex];
              return (
                <MissionCalendarCell
                  key={`${weekIndex}-${dayIndex}`}
                  date={date}
                  schedule={getEffectiveMissionSchedule(mission, date)}
                  onUpdateSchedule={onUpdateSchedule}
                  onOpenRepeat={(missionId, date, schedule) => {
                    console.log('Setting mission repeat popup state:', { missionId, date, schedule });
                    setRepeatPopup({ open: true, missionId, date, schedule });
                  }}
                  onCancelRepeat={async (missionId, date) => {
                    console.log('Canceling mission repeat for date:', date);
                    await onAddRepeatException({ id: missionId as any, date });
                  }}
                  onOpenRemoveRepeat={(missionId, date) => {
                    console.log('Opening remove mission repeat popup for date:', date);
                    setRemoveRepeatPopup({ open: true, missionId, date });
                  }}
                  missionId={mission._id}
                  isToday={isToday(date)}
                />
              );
            })}
          </>
        ))}
      </div>

      {/* Mission Repeat Popup */}
      {repeatPopup?.open && (
        <RepeatPopup
          personId={repeatPopup.missionId}
          date={repeatPopup.date}
          availability={{
            unavailable: repeatPopup.schedule.scheduled,
            startTime: repeatPopup.schedule.startTime,
            endTime: repeatPopup.schedule.endTime
          }}
          onApply={async (missionId: string, startDate: string, schedule: any, repeatEvery: number, repeatUnit: any, enableRepeat: boolean) => {
            await handleApplyRepeat(missionId, startDate, {
              scheduled: schedule.unavailable,
              startTime: schedule.startTime,
              endTime: schedule.endTime
            }, repeatEvery, repeatUnit, enableRepeat);
          }}
          onClose={() => {
            console.log('Closing mission repeat popup');
            setRepeatPopup(null);
          }}
        />
      )}

      {/* Remove Mission Repeat Popup */}
      {removeRepeatPopup?.open && (
        <RemoveRepeatPopup
          personId={removeRepeatPopup.missionId}
          date={removeRepeatPopup.date}
          onRemoveOne={(missionId: string, date: string) => {
            console.log('Removing only this mission date (adding exception):', date);
            onAddRepeatException({ id: missionId as any, date });
            setRemoveRepeatPopup(null);
          }}
          onRemoveAllFollowing={(missionId: string, date: string) => {
            console.log('Removing this mission date and all following:', date);
            
            // Find the pattern this date belongs to
            const patternStartDate = mission.repeatPatterns ? Object.keys(mission.repeatPatterns).find(startDate => 
              matchesMissionRepeatPattern(date, startDate, mission.repeatPatterns![startDate])
            ) : null;
            
            console.log('Mission pattern analysis:', {
              date,
              patternStartDate,
              isOriginalDate: date === patternStartDate
            });
            
            if (patternStartDate) {
              if (date === patternStartDate) {
                // Removing from original date = delete entire pattern
                console.log('Deleting entire mission pattern starting from:', patternStartDate);
                onRemoveRepeatPattern({ id: missionId as any, startDate: patternStartDate });
              } else {
                // Removing from repeated instance = stop future repeats from this date
                console.log('Stopping future mission repeats from:', date);
                onStopFutureRepeats({ 
                  id: missionId as any, 
                  startDate: patternStartDate,
                  customStopFromDate: date
                });
              }
            }
            
            setRemoveRepeatPopup(null);
          }}
          onClose={() => {
            console.log('Closing remove mission repeat popup');
            setRemoveRepeatPopup(null);
          }}
        />
      )}
    </div>
  );
}

function MissionCalendarCell({ 
  date, 
  schedule,
  onUpdateSchedule,
  onOpenRepeat,
  onCancelRepeat,
  onOpenRemoveRepeat,
  missionId,
  isToday: isTodayProp = false
}: {
  date: string;
  schedule?: { scheduled: boolean; startTime?: string; endTime?: string; isRepeated?: boolean; isRepeatOrigin?: boolean; isResetOrigin?: boolean; originalStartDate?: string; futureRepeatsStopped?: boolean; wasBrokenFromPattern?: boolean };
  onUpdateSchedule: any;
  onOpenRepeat: (missionId: string, date: string, schedule: { scheduled: boolean; startTime?: string; endTime?: string }) => void;
  onCancelRepeat: (missionId: string, date: string) => void;
  onOpenRemoveRepeat: (missionId: string, date: string) => void;
  missionId: string;
  isToday?: boolean;
}) {
  const [isFullDay, setIsFullDay] = useState(() => {
    // FULL day can be represented as:
    // 1. Empty strings (from FULL day repeat patterns)
    // 2. '00:00' to '23:59' (from manual TIME setting that covers full day)
    const isEmptyStrings = !schedule?.startTime && !schedule?.endTime;
    const isFullDayTimes = schedule?.startTime === '00:00' && schedule?.endTime === '23:59';
    return isEmptyStrings || isFullDayTimes;
  });
  const [localStartTime, setLocalStartTime] = useState(schedule?.startTime || '');
  const [localEndTime, setLocalEndTime] = useState(schedule?.endTime || '');

  useEffect(() => {
    console.log('MissionCalendarCell useEffect - syncing with schedule:', { date, schedule });
    
    // Sync with schedule data (both direct and pattern-derived)
    if (schedule) {
      setLocalStartTime(schedule?.startTime || '');
      setLocalEndTime(schedule?.endTime || '');
      
      // Update full day state based on saved times
      const isEmptyStrings = !schedule?.startTime && !schedule?.endTime;
      const isFullDayTimes = schedule?.startTime === '00:00' && schedule?.endTime === '23:59';
      const shouldBeFullDay = isEmptyStrings || isFullDayTimes;
      
      console.log('FULL day detection:', { 
        date, 
        startTime: schedule?.startTime, 
        endTime: schedule?.endTime,
        isEmptyStrings, 
        isFullDayTimes, 
        shouldBeFullDay 
      });
      
      setIsFullDay(shouldBeFullDay);
    }
  }, [schedule, date]);

  const isScheduled = schedule?.scheduled || false;
  const dayNumber = getDayOfMonth(date);

  const handleScheduledToggle = () => {
    const newScheduled = !isScheduled;
    console.log('handleScheduledToggle called:', { date, newScheduled, schedule });
    
    if (newScheduled) {
      // CHECKING - Always start fresh, no memory of previous state
      console.log('Checking mission cell - starting fresh, resetting all settings');
      setIsFullDay(true);
      setLocalStartTime('');
      setLocalEndTime('');
      // Use empty strings for FULL day mode to maintain pattern consistency
      onUpdateSchedule({
        id: missionId,
        date: date,
        scheduled: true,
        startTime: '',
        endTime: ''
      });
    } else {
      // UNCHECKING - If this was a repeated instance, show popup to ask about removal scope
      console.log('Unchecking - checking if repeated:', { 
        isRepeated: schedule?.isRepeated, 
        originalStartDate: schedule?.originalStartDate 
      });
      
      if (schedule?.isRepeated && schedule?.originalStartDate) {
        console.log('Opening remove repeat popup for date:', date);
        onOpenRemoveRepeat(missionId, date);
        return; // Don't call onUpdateSchedule yet, wait for user choice
      } else {
        // Regular toggle
        console.log('Regular toggle - setting scheduled to false');
        onUpdateSchedule({
          id: missionId,
          date: date,
          scheduled: false
        });
      }
    }
  };

  const handleTimeUpdate = () => {
    if (isScheduled) {
      // For FULL day mode, pass empty strings to maintain pattern consistency
      const startTime = isFullDay ? '' : (localStartTime || '');
      const endTime = isFullDay ? '' : (localEndTime || '');
      
      console.log('handleTimeUpdate:', { date, isFullDay, startTime, endTime });
      onUpdateSchedule({
        id: missionId,
        date: date,
        scheduled: true,
        startTime,
        endTime
      });
    }
  };

  const handleModeSwitch = (fullDay: boolean) => {
    setIsFullDay(fullDay);
    
    // When switching to TIME mode, clear the time values
    if (!fullDay) {
      setLocalStartTime('');
      setLocalEndTime('');
    }
    
    if (isScheduled) {
      // For FULL day mode, use empty strings to maintain pattern consistency
      const startTime = fullDay ? '' : '';
      const endTime = fullDay ? '' : '';
      
      console.log('handleModeSwitch:', { date, fullDay, startTime, endTime });
      onUpdateSchedule({
        id: missionId,
        date: date,
        scheduled: true,
        startTime,
        endTime
      });
    }
  };

  return (
    <div
      style={{
        backgroundColor: isTodayProp ? '#f0f0f0' : '#ffffff',
        minHeight: '120px',
        display: 'flex',
        flexDirection: 'column',
        padding: '4px',
        position: 'relative'
      }}
    >
      {/* Top row with date and checkbox */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '4px'
      }}>
        {/* Date number - top left */}
        <div style={{ 
          fontSize: '12px', 
          fontWeight: 'bold'
        }}>
          {dayNumber}
        </div>

        {/* Scheduled checkbox - top right */}
        <div
          style={{
            width: '16px',
            height: '16px',
            border: '2px solid #000000',
            backgroundColor: isScheduled ? '#000000' : '#ffffff',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: '10px',
            color: isScheduled ? '#ffffff' : '#000000',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
          onClick={handleScheduledToggle}
        >
          {isScheduled ? '✓' : ''}
        </div>
      </div>

      {/* Full/Time mode switch */}
      {isScheduled && (
        <div style={{ display: 'flex', marginBottom: '4px' }}>
          <button
            onClick={() => handleModeSwitch(true)}
            style={{
              flex: 1,
              fontSize: '8px',
              padding: '2px',
              backgroundColor: isFullDay ? '#000000' : '#ffffff',
              color: isFullDay ? '#ffffff' : '#000000',
              border: '2px solid #000000',
              cursor: 'pointer',
              fontWeight: 'bold',
              minHeight: '20px'
            }}
          >
            FULL
          </button>
          <button
            onClick={() => handleModeSwitch(false)}
            style={{
              flex: 1,
              fontSize: '8px',
              padding: '2px',
              backgroundColor: !isFullDay ? '#000000' : '#ffffff',
              color: !isFullDay ? '#ffffff' : '#000000',
              border: '2px solid #000000',
              borderLeft: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
              minHeight: '20px'
            }}
          >
            TIME
          </button>
        </div>
      )}

      {/* Time inputs */}
      {isScheduled && !isFullDay && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          marginBottom: '4px'
        }}>
          <TimeInput24
            value={localStartTime}
            onChange={setLocalStartTime}
            onBlur={handleTimeUpdate}
          />
          <span style={{
            fontSize: '8px',
            fontWeight: 'bold',
            color: '#000000'
          }}>
            to:
          </span>
          <TimeInput24
            value={localEndTime}
            onChange={setLocalEndTime}
            onBlur={handleTimeUpdate}
          />
        </div>
      )}

      {/* Action buttons - full width */}
      {isScheduled && (
        <div style={{ display: 'flex', gap: '1px', marginTop: 'auto' }}>
          {(() => {
            // Show REPEAT button for:
            // 1. Regular dates (not part of any pattern)
            // 2. Dates that were broken from patterns (have direct schedule, not pattern-derived)
            // 3. Reset original dates (were unchecked and rechecked) - isResetOrigin: true
            // 
            // DON'T show REPEAT button for:
            // 4. Non-reset original dates (still part of active pattern) - isRepeatOrigin: true, isResetOrigin: false
            // 5. Repeated instances - isRepeated: true
            
            const shouldShowRepeat = !schedule?.isRepeated && (!schedule?.isRepeatOrigin || schedule?.isResetOrigin);
            console.log('Button logic for mission date:', date, {
              schedule,
              isRepeatOrigin: schedule?.isRepeatOrigin,
              isResetOrigin: schedule?.isResetOrigin,
              isRepeated: schedule?.isRepeated,
              wasBrokenFromPattern: schedule?.wasBrokenFromPattern,
              shouldShowRepeat,
              hasDirectSchedule: !!schedule && !schedule.isRepeated
            });
            
            return shouldShowRepeat ? (
              // Regular date or broken from pattern - show REPEAT
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('Mission repeat button clicked for date:', date, 'missionId:', missionId, 'isFullDay:', isFullDay);
                  
                  // For FULL day, pass empty strings to indicate full day (not specific times)
                  const repeatSchedule = {
                    scheduled: isScheduled,
                    startTime: isFullDay ? '' : localStartTime,
                    endTime: isFullDay ? '' : localEndTime
                  };
                  
                  console.log('Passing schedule to mission repeat popup:', { 
                    ...repeatSchedule, 
                    isFullDay,
                    originalLocalTimes: { localStartTime, localEndTime }
                  });
                  onOpenRepeat(missionId, date, repeatSchedule);
                }}
                style={{
                  flex: 1,
                  fontSize: '8px',
                  fontWeight: 'bold',
                  padding: '4px',
                  backgroundColor: '#000000',
                  color: '#ffffff',
                  border: '2px solid #000000',
                  cursor: 'pointer',
                  minHeight: '20px'
                }}
              >
                REPEAT
              </button>
            ) : (
              // Repeated date - no button, just empty space
              <div style={{ flex: 1, minHeight: '20px' }}></div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function CalendarGrid({ 
  person, 
  weekOffset,
  onUpdateAvailability,
  onOpenRepeat,
  onCancelRepeat,
  onUnrepeat,
  onOpenRemoveRepeat
}: {
  person: Person;
  weekOffset: number;
  onUpdateAvailability: (personId: string, date: string, unavailable: boolean, startTime?: string, endTime?: string) => Promise<void>;
  onOpenRepeat: (personId: string, date: string, availability: { unavailable: boolean; startTime?: string; endTime?: string }) => void;
  onCancelRepeat: (personId: string, date: string) => void;
  onUnrepeat: (personId: string, date: string) => void;
  onOpenRemoveRepeat: (personId: string, date: string) => void;
}) {
  const { weekNumbers, dates } = getThreeWeeks(weekOffset);
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '50px repeat(3, 1fr)',
      gap: '1px',
      border: '2px solid #000000',
      backgroundColor: '#000000' // Grid line color
    }}>
      {/* Header row - week numbers */}
      <div style={{
        backgroundColor: '#ffffff',
        padding: '8px 4px',
        fontSize: '10px',
        fontWeight: 'bold',
        textAlign: 'center'
      }}>
        WEEK
      </div>
      
      {weekNumbers.map((weekNum) => (
        <div
          key={weekNum}
          style={{
            backgroundColor: '#ffffff',
            padding: '8px 4px',
            fontSize: '10px',
            fontWeight: 'bold',
            textAlign: 'center'
          }}
        >
          {weekNum}
        </div>
      ))}

      {/* Calendar rows - one for each day of the week */}
      {dayNames.map((dayName, dayIndex) => (
        <>
          {/* Day name in first column */}
          <div
            key={`day-${dayName}`}
            style={{
              backgroundColor: '#ffffff',
              padding: '4px',
              fontSize: '10px',
              fontWeight: 'bold',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {dayName}
          </div>
          
          {/* Days for this day of week across the 3 weeks */}
          {dates.map((week, weekIndex) => {
            const date = week[dayIndex];
            return (
              <CalendarCell
                key={`${weekIndex}-${dayIndex}`}
                date={date}
                availability={getEffectiveAvailability(person, date)}
                onUpdateAvailability={onUpdateAvailability}
                onOpenRepeat={onOpenRepeat}
                onCancelRepeat={onCancelRepeat}
                onUnrepeat={onUnrepeat}
                onOpenRemoveRepeat={onOpenRemoveRepeat}
                personId={person._id}
                isToday={isToday(date)}
              />
            );
          })}
        </>
      ))}
    </div>
  );
}

function CalendarCell({ 
  date, 
  availability,
  onUpdateAvailability,
  onOpenRepeat,
  onCancelRepeat,
  onUnrepeat,
  onOpenRemoveRepeat,
  personId,
  isToday: isTodayProp = false
}: {
  date: string;
  availability?: { unavailable: boolean; startTime?: string; endTime?: string; isRepeated?: boolean; isRepeatOrigin?: boolean; isResetOrigin?: boolean; originalStartDate?: string; futureRepeatsStopped?: boolean; wasBrokenFromPattern?: boolean };
  onUpdateAvailability: (personId: string, date: string, unavailable: boolean, startTime?: string, endTime?: string) => Promise<void>;
  onOpenRepeat: (personId: string, date: string, availability: { unavailable: boolean; startTime?: string; endTime?: string }) => void;
  onCancelRepeat: (personId: string, date: string) => void;
  onUnrepeat: (personId: string, date: string) => void;
  onOpenRemoveRepeat: (personId: string, date: string) => void;
  personId: string;
  isToday?: boolean;
}) {
  const [isFullDay, setIsFullDay] = useState(() => {
    // FULL day can be represented as:
    // 1. Empty strings (from FULL day repeat patterns)
    // 2. '00:00' to '23:59' (from manual TIME setting that covers full day)
    const isEmptyStrings = !availability?.startTime && !availability?.endTime;
    const isFullDayTimes = availability?.startTime === '00:00' && availability?.endTime === '23:59';
    return isEmptyStrings || isFullDayTimes;
  });
  const [localStartTime, setLocalStartTime] = useState(availability?.startTime || '');
  const [localEndTime, setLocalEndTime] = useState(availability?.endTime || '');

  useEffect(() => {
    console.log('CalendarCell useEffect - syncing with availability:', { date, availability });
    
    // Sync with availability data (both direct and pattern-derived)
    if (availability) {
      setLocalStartTime(availability?.startTime || '');
      setLocalEndTime(availability?.endTime || '');
      
      // Update full day state based on saved times
      const isEmptyStrings = !availability?.startTime && !availability?.endTime;
      const isFullDayTimes = availability?.startTime === '00:00' && availability?.endTime === '23:59';
      const shouldBeFullDay = isEmptyStrings || isFullDayTimes;
      
      console.log('FULL day detection:', { 
        date, 
        startTime: availability?.startTime, 
        endTime: availability?.endTime,
        isEmptyStrings, 
        isFullDayTimes, 
        shouldBeFullDay 
      });
      
      setIsFullDay(shouldBeFullDay);
    }
  }, [availability, date]);

  const isUnavailable = availability?.unavailable || false;
  const dayNumber = getDayOfMonth(date);

  const handleUnavailableToggle = () => {
    const newUnavailable = !isUnavailable;
    console.log('handleUnavailableToggle called:', { date, newUnavailable, availability });
    
    if (newUnavailable) {
      // CHECKING - Always start fresh, no memory of previous state
      console.log('Checking cell - starting fresh, resetting all settings');
      setIsFullDay(true);
      setLocalStartTime('');
      setLocalEndTime('');
      // Use empty strings for FULL day mode to maintain pattern consistency
      onUpdateAvailability(personId, date, true, '', '');
    } else {
      // UNCHECKING - If this was a repeated instance, show popup to ask about removal scope
      console.log('Unchecking - checking if repeated:', { 
        isRepeated: availability?.isRepeated, 
        originalStartDate: availability?.originalStartDate 
      });
      
      if (availability?.isRepeated && availability?.originalStartDate) {
        console.log('Opening remove repeat popup for date:', date);
        onOpenRemoveRepeat(personId, date);
        return; // Don't call onUpdateAvailability yet, wait for user choice
      } else {
        // Regular unavailable toggle
        console.log('Regular toggle - setting unavailable to false');
        onUpdateAvailability(personId, date, false);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (isUnavailable) {
      // For FULL day mode, pass empty strings to maintain pattern consistency
      const startTime = isFullDay ? '' : (localStartTime || '');
      const endTime = isFullDay ? '' : (localEndTime || '');
      
      console.log('handleTimeUpdate:', { date, isFullDay, startTime, endTime });
      onUpdateAvailability(personId, date, true, startTime, endTime);
    }
  };

  const handleModeSwitch = (fullDay: boolean) => {
    setIsFullDay(fullDay);
    
    // When switching to TIME mode, clear the time values
    if (!fullDay) {
      setLocalStartTime('');
      setLocalEndTime('');
    }
    
    if (isUnavailable) {
      // For FULL day mode, use empty strings to maintain pattern consistency
      const startTime = fullDay ? '' : '';
      const endTime = fullDay ? '' : '';
      
      console.log('handleModeSwitch:', { date, fullDay, startTime, endTime });
      onUpdateAvailability(personId, date, true, startTime, endTime);
    }
  };

  return (
    <div style={{
      backgroundColor: isTodayProp ? '#f0f0f0' : '#ffffff',
      aspectRatio: '1',
      minHeight: '120px',
      padding: '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px'
    }}>
      {/* Top row: Date and Checkbox */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start'
      }}>
        <span style={{ 
          fontSize: '16px', 
          fontWeight: 'bold',
          lineHeight: '1'
        }}>
          {dayNumber}
        </span>
        <div
          style={{
            width: '20px',
            height: '20px',
            border: '2px solid #000000',
            backgroundColor: isUnavailable ? '#000000' : '#ffffff',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: '12px',
            color: isUnavailable ? '#ffffff' : '#000000',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
          onClick={handleUnavailableToggle}
        >
          {isUnavailable ? '✓' : ''}
        </div>
      </div>

      {/* Mode switch */}
      {isUnavailable && (
        <div style={{
          display: 'flex'
        }}>
          <button
            onClick={() => handleModeSwitch(true)}
            style={{
              flex: 1,
              fontSize: '10px',
              padding: '6px',
              backgroundColor: isFullDay ? '#000000' : '#ffffff',
              color: isFullDay ? '#ffffff' : '#000000',
              border: '2px solid #000000',
              cursor: 'pointer',
              fontWeight: 'bold',
              minHeight: '30px'
            }}
          >
            FULL
          </button>
          <button
            onClick={() => handleModeSwitch(false)}
            style={{
              flex: 1,
              fontSize: '10px',
              padding: '6px',
              backgroundColor: !isFullDay ? '#000000' : '#ffffff',
              color: !isFullDay ? '#ffffff' : '#000000',
              border: '2px solid #000000',
              borderLeft: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
              minHeight: '30px'
            }}
          >
            TIME
          </button>
        </div>
      )}

      {/* Time inputs */}
      {isUnavailable && !isFullDay && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <TimeInput24
            value={localStartTime}
            onChange={setLocalStartTime}
            onBlur={handleTimeUpdate}
          />
          <span style={{
            fontSize: '10px',
            fontWeight: 'bold',
            color: '#000000'
          }}>
            to:
          </span>
          <TimeInput24
            value={localEndTime}
            onChange={setLocalEndTime}
            onBlur={handleTimeUpdate}
          />
        </div>
      )}

      {/* Action buttons - full width */}
      {isUnavailable && (
        <div style={{ display: 'flex', gap: '2px', marginTop: 'auto' }}>
          {(() => {
            // Show REPEAT button for:
            // 1. Regular dates (not part of any pattern)
            // 2. Dates that were broken from patterns (have direct availability, not pattern-derived)
            // 3. Reset original dates (were unchecked and rechecked) - isResetOrigin: true
            // 
            // DON'T show REPEAT button for:
            // 4. Non-reset original dates (still part of active pattern) - isRepeatOrigin: true, isResetOrigin: false
            // 5. Repeated instances - isRepeated: true
            
            const shouldShowRepeat = !availability?.isRepeated && (!availability?.isRepeatOrigin || availability?.isResetOrigin);
            console.log('Button logic for date:', date, {
              availability,
              isRepeatOrigin: availability?.isRepeatOrigin,
              isResetOrigin: availability?.isResetOrigin,
              isRepeated: availability?.isRepeated,
              wasBrokenFromPattern: availability?.wasBrokenFromPattern,
              shouldShowRepeat,
              hasDirectAvailability: !!availability && !availability.isRepeated
            });
            
            return shouldShowRepeat ? (
              // Regular date or broken from pattern - show REPEAT
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('Repeat button clicked for date:', date, 'personId:', personId, 'isFullDay:', isFullDay);
                  
                  // For FULL day, pass empty strings to indicate full day (not specific times)
                  const repeatAvailability = {
                    unavailable: isUnavailable,
                    startTime: isFullDay ? '' : localStartTime,
                    endTime: isFullDay ? '' : localEndTime
                  };
                  
                  console.log('Passing availability to repeat popup:', { 
                    ...repeatAvailability, 
                    isFullDay,
                    originalLocalTimes: { localStartTime, localEndTime }
                  });
                  onOpenRepeat(personId, date, repeatAvailability);
                }}
                style={{
                  flex: 1,
                  fontSize: '10px',
                  fontWeight: 'bold',
                  padding: '6px',
                  backgroundColor: '#000000',
                  color: '#ffffff',
                  border: '2px solid #000000',
                  cursor: 'pointer',
                  minHeight: '30px'
                }}
              >
                REPEAT
              </button>
            ) : (
              // Repeated date - no button, just empty space
              (() => {
                console.log('NOT showing REPEAT button for date:', date, 'because shouldShowRepeat is false');
                return <div style={{ flex: 1, minHeight: '30px' }}></div>;
              })()
            );
          })()}
        </div>
      )}
    </div>
  );
}
