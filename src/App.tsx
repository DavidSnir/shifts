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
          { id: 'mission' as TabType, label: 'MISSION' },
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
  return (
    <div>
      <h2 style={{ 
        fontSize: '20px', 
        fontWeight: 'bold', 
        marginBottom: '20px',
        color: '#000000'
      }}>
        MISSION
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
