import { useEffect, useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../convex/_generated/api'
import { UnifiedDateGrid } from './components/UnifiedDateSelection'
import CollapsibleSection from './components/CollapsibleSection'
import SmallIconButton from './components/SmallIconButton'
import type { Mission, Person } from './types'

export default function MissionTab() {
    const [showingMissionPage, setShowingMissionPage] = useState<Mission | null>(null);
    const [editingMissionName, setEditingMissionName] = useState<string | null>(null);
    const [newMissionName, setNewMissionName] = useState('');
  
    // Mission-related hooks
    const missions = useQuery(api.people.listMissions) as Mission[] | undefined
    const addMission = useMutation(api.people.addMission)
    const updateMissionName = useMutation(api.people.updateMissionName)
    const updateMissionMinLength = useMutation(api.people.updateMissionMinLength)
    const updateMissionMaxLength = useMutation(api.people.updateMissionMaxLength)
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
  
    const missionsLoading = missions === undefined
    const peopleLoading = people === undefined

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
      if (missionsLoading) {
        return (
          <div>
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
            <div style={{
              padding: '16px',
              border: '2px solid #000000',
              backgroundColor: '#ffffff',
              textAlign: 'center',
              fontSize: '14px',
              color: '#000000'
            }}>
              Loading mission...
            </div>
          </div>
        )
      }
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
        
        {/* Mission Length Section */}
        <div style={{ marginBottom: '30px' }}>
          <div style={{
            fontSize: '16px',
            fontWeight: 'bold',
            marginBottom: '12px'
          }}>
            MISSION LENGTH:
          </div>
          
          <div style={{ display: 'grid', gap: '12px' }}>
            {/* Min Length (Required) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold', minWidth: '120px' }}>
                Min Length: *
              </label>
              <input
                type="number"
                min="1"
                value={currentMission.minLength || 1}
                onChange={(e) => {
                  const value = Math.max(1, parseInt(e.target.value) || 1);
                  updateMissionMinLength({ id: currentMission._id as any, minLength: value });
                }}
                style={{
                  fontSize: '14px',
                  padding: '8px',
                  border: '2px solid #000000',
                  backgroundColor: '#ffffff',
                  flex: 1
                }}
                placeholder="Minimum mission length (required)"
              />
            </div>
            
            {/* Max Length (Optional) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold', minWidth: '120px' }}>
                Max Length:
              </label>
              <input
                type="number"
                min={(currentMission.minLength || 1)}
                value={currentMission.maxLength || ''}
                onChange={(e) => {
                  const value = e.target.value ? parseInt(e.target.value) : undefined;
                  updateMissionMaxLength({ id: currentMission._id as any, maxLength: value });
                }}
                style={{
                  fontSize: '14px',
                  padding: '8px',
                  border: '2px solid #000000',
                  backgroundColor: '#ffffff',
                  flex: 1
                }}
                placeholder="Maximum mission length (optional)"
              />
          </div>
        </div>
        </div>
        
        {/* Property Filters Section */}
        <div style={{ marginBottom: '30px' }}>
          <CollapsibleSection
            title="PROPERTY FILTERS"
            count={Object.keys(currentMission.propertyFilters || {}).length}
            defaultOpen
          >
            <div style={{ display: 'grid', gap: '8px', marginBottom: '12px', gridTemplateColumns: '1fr 1fr' }}>
              {Object.keys(currentMission.propertyFilters || {}).map((propertyKey) => {
                const filter = currentMission.propertyFilters[propertyKey] as { required: boolean; value: boolean };
                const propertyDisplayName = people?.[0]?.propertyNames?.[propertyKey] || propertyKey;
                
                return (
                  <div
                    key={propertyKey}
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
                      {propertyDisplayName}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '16px',
                          height: '16px',
                          border: '2px solid #000000',
                          backgroundColor: filter.required ? '#000000' : '#ffffff',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          fontSize: '10px',
                          color: filter.required ? '#ffffff' : '#000000',
                          fontWeight: 'bold',
                          cursor: 'pointer'
                        }}
                        onClick={() => updateMissionPropertyFilter({ 
                          id: currentMission._id as any, 
                          propertyKey, 
                          required: !filter.required, 
                          value: true
                        })}
                        title={filter.required ? 'Person must have this property' : 'Person must NOT have this property'}
                      >
                        {filter.required ? '✓' : ''}
                      </div>
                      <SmallIconButton
                        label="Remove filter"
                        title="Remove"
                        onClick={() => removeMissionPropertyFilter({ id: currentMission._id as any, propertyKey })}
                      />
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
                  cursor: 'pointer',
                  gridColumn: '1 / -1'
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
          </CollapsibleSection>
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
            {peopleLoading && (
              <div style={{
                padding: '12px',
                border: '2px solid #000000',
                backgroundColor: '#ffffff',
                textAlign: 'center',
                fontSize: '12px',
                color: '#000000'
              }}>
                Loading people...
              </div>
            )}
            {(() => {
              // Filter people based on mission property filters
              const compatiblePeople = people?.filter(person => {
                // If no filters, everyone is compatible
                if (!currentMission.propertyFilters || Object.keys(currentMission.propertyFilters).length === 0) {
                  return true;
                }
                
                // Check each filter
                return Object.entries(currentMission.propertyFilters as Record<string, { required: boolean; value: boolean }>).every(([propertyKey, filter]) => {
                  const personHasProperty = person.properties[propertyKey] === true;
                  
                  // Simplified logic: required = person must have property, !required = person must NOT have property
                  return filter.required ? personHasProperty : !personHasProperty;
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
                    {Object.entries(currentMission.propertyFilters as Record<string, { required: boolean; value: boolean }> || {}).map(([propertyKey, filter]) => {
                      const propertyDisplayName = people?.[0]?.propertyNames?.[propertyKey] || propertyKey;
                      const personHasProperty = person.properties[propertyKey] === true;
                      const matchesFilter = filter.required ? personHasProperty : !personHasProperty;
                      
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
          <UnifiedDateGrid
            title={`${currentMission.name} - Schedule`}
            data={currentMission}
            type="mission"
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
  
    if (missionsLoading) {
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
            <div style={{
              padding: '16px',
              border: '2px solid #000000',
              backgroundColor: '#ffffff',
              textAlign: 'center',
              fontSize: '14px',
              color: '#000000'
            }}>
              Loading missions...
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
  