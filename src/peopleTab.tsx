import { useEffect, useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../convex/_generated/api'
import { UnifiedDateGrid } from './components/UnifiedDateSelection'
import CollapsibleSection from './components/CollapsibleSection'
import SmallIconButton from './components/SmallIconButton'
import type { Person } from './types'

export default function PeopleTab() {
    const [editingPersonName, setEditingPersonName] = useState<string | null>(null)
    const [newPersonName, setNewPersonName] = useState('')
    const [addingProperty, setAddingProperty] = useState(false)
    const [newPropertyName, setNewPropertyName] = useState('')
    const [showingPersonPage, setShowingPersonPage] = useState<Person | null>(null)
    const [weekOffset, setWeekOffset] = useState(0)
    
    const people = useQuery(api.people.list) as Person[] | undefined
    const peopleLoading = people === undefined
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
      if (peopleLoading) {
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
              <button 
                onClick={() => setShowingPersonPage(null)}
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
                EDIT PERSON
              </h2>
            </div>
            <div style={{
              padding: '16px',
              border: '2px solid #000000',
              backgroundColor: '#ffffff',
              textAlign: 'center',
              fontSize: '14px',
              color: '#000000'
            }}>
              Loading person...
            </div>
          </div>
        )
      }
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
  
    if (peopleLoading) {
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
          <div style={{ display: 'grid', gap: '16px' }}>
            <div style={{
              padding: '16px',
              border: '2px solid #000000',
              backgroundColor: '#ffffff',
              textAlign: 'center',
              fontSize: '14px',
              color: '#000000'
            }}>
              Loading people...
            </div>
          </div>
        </div>
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
        <div style={{ display: 'grid', gap: '16px' }}>
            {people!.map((person) => (
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
                
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(Object.entries(person.properties || {}) as [string, boolean][]) 
                    .filter(([_, value]) => value)
                    .map(([key]) => (
                      <span
                        key={key}
                        style={{
                          fontSize: '12px',
                          fontWeight: 'bold',
                          border: '2px solid #000000',
                          padding: '2px 8px',
                          backgroundColor: '#ffffff'
                        }}
                      >
                        {getPropertyDisplayName(key)}
                      </span>
                    ))}
                </div>
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
    // onOpenRepeat,
    // weekOffset,
    // onWeekOffsetChange, 
    onBack, 
    onDelete,
    addRepeatPattern,
    removeRepeatPattern,
    addRepeatException,
    stopFutureRepeats,
    // clearRepeatExceptions 
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
    // legacy repeatPopup state removed
  
    // const [unrepeatPopup, setUnrepeatPopup] = useState<{
    //   open: boolean;
    //   personId: string;
    //   startDate: string;
    // } | null>(null)
  
    // legacy removeRepeatPopup state removed
  
    // Update name value when person changes
    useEffect(() => {
      setNameValue(person.name)
    }, [person.name])
  
    // legacy handleApplyRepeat removed; UnifiedDateGrid handles repeat logic
  
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
          <CollapsibleSection title="PROPERTIES" count={allPropertyKeys.length} defaultOpen>
            <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: '1fr 1fr' }}>
              {allPropertyKeys.map((key) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px',
                    border: '2px solid #000000',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <span style={{ fontSize: '13px', flex: 1 }}>
                    {getPropertyDisplayName(key)}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        border: '2px solid #000000',
                        backgroundColor: person.properties[key] ? '#000000' : '#ffffff',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        fontSize: '10px',
                        color: person.properties[key] ? '#ffffff' : '#000000',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                      onClick={() => onPropertyToggle(
                        person._id,
                        key,
                        person.properties[key] || false
                      )}
                      title={person.properties[key] ? 'Has property' : 'Does not have property'}
                    >
                      {person.properties[key] ? '✓' : ''}
                    </div>
                    <SmallIconButton
                      label="Remove property"
                      title="Remove"
                      onClick={() => onRemoveProperty(key)}
                    />
                  </div>
                </div>
              ))}

              {/* Add Property Section */}
              {addingProperty ? (
                <div style={{
                  padding: '8px',
                  border: '2px solid #000000',
                  backgroundColor: '#ffffff',
                  gridColumn: '1 / -1'
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
                    padding: '16px 12px',
                    border: '2px dashed #000000',
                    cursor: 'pointer',
                    backgroundColor: '#ffffff',
                    gridColumn: '1 / -1'
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
          </CollapsibleSection>
        </div>
  
        {/* Calendar Section */}
        <div style={{ marginBottom: '20px' }}>
          <UnifiedDateGrid
            title={`${person.name} - Availability`}
            data={person}
            type="person"
            onUpdateAvailability={onUpdateAvailability}
            onAddRepeatPattern={addRepeatPattern}
            onRemoveRepeatPattern={removeRepeatPattern}
            onAddRepeatException={addRepeatException}
            onStopFutureRepeats={stopFutureRepeats}
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
  
          {/* Repeat/Remove repeat popups are handled in UnifiedDateGrid */}
  
      </div>
    )
  }