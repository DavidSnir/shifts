import { useEffect, useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../convex/_generated/api'
import { UnifiedDateGrid } from './components/UnifiedDateSelection'
import CollapsibleSection from './components/CollapsibleSection'
import SmallIconButton from './components/SmallIconButton'
import type { Rule, Person } from './types'

function RulePage({ 
    rule, 
    onBack,
    people 
  }: { 
    rule: Rule; 
    onBack: () => void;
    people: Person[] | undefined;
  }) {
    const rules = useQuery(api.people.listRules);
    const updateRuleName = useMutation(api.people.updateRuleName);
    const updateRulePropertyFilter = useMutation(api.people.updateRulePropertyFilter);
    const removeRulePropertyFilter = useMutation(api.people.removeRulePropertyFilter);
    const updateRuleSchedule = useMutation(api.people.updateRuleSchedule);
    const addRuleRepeatPattern = useMutation(api.people.addRuleRepeatPattern);
    const removeRuleRepeatPattern = useMutation(api.people.removeRuleRepeatPattern);
    const addRuleRepeatException = useMutation(api.people.addRuleRepeatException);
    const stopFutureRuleRepeats = useMutation(api.people.stopFutureRuleRepeats);
    const removeRule = useMutation(api.people.removeRule);
  
    // Get the current rule data with live updates
    const currentRule = rules?.find(r => r._id === rule._id) || rule;
  
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
          <button 
            onClick={onBack}
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
            EDIT RULE
          </h2>
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <input
            type="text"
            value={currentRule.name}
            onChange={(e) => {
              const newName = e.target.value;
              // Only update if it's not empty and doesn't already exist
              if (newName.trim()) {
                const nameExists = rules?.some(r => 
                  r.name.toLowerCase() === newName.trim().toLowerCase() && 
                  r._id !== currentRule._id
                );
                
                if (!nameExists) {
                  updateRuleName({ id: currentRule._id as any, name: newName.trim() });
                }
              }
            }}
            onBlur={(e) => {
              const newName = e.target.value;
              if (!newName.trim()) {
                // If empty, revert or delete
                if (currentRule.name === "new rule") {
                  removeRule({ id: currentRule._id as any });
                  onBack();
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
          <CollapsibleSection
            title="PROPERTY FILTERS"
            count={Object.keys(currentRule.propertyFilters || {}).length}
            defaultOpen
          >
            <div style={{ display: 'grid', gap: '8px', marginBottom: '12px', gridTemplateColumns: '1fr 1fr' }}>
              {Object.keys(currentRule.propertyFilters || {}).map((propertyKey) => {
                const filter = currentRule.propertyFilters[propertyKey] as { required: boolean; value: boolean };
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
                        onClick={() => updateRulePropertyFilter({ 
                          id: currentRule._id as any, 
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
                        onClick={() => removeRulePropertyFilter({ id: currentRule._id as any, propertyKey })}
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
                  if (propertyKey && !currentRule.propertyFilters[propertyKey]) {
                    updateRulePropertyFilter({ 
                      id: currentRule._id as any, 
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
                  !currentRule.propertyFilters[key]
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
            APPLICABLE TO:
          </div>
          
          <div style={{ display: 'grid', gap: '8px' }}>
            {(() => {
              // Filter people based on rule property filters
              const applicablePeople = people?.filter(person => {
                // If no filters, applies to everyone
                if (!currentRule.propertyFilters || Object.keys(currentRule.propertyFilters).length === 0) {
                  return true;
                }
                
                // Check each filter
                return Object.entries(currentRule.propertyFilters).every(([propertyKey, filter]) => {
                  const filterTyped = filter as { required: boolean; value: boolean };
                  const personHasProperty = person.properties[propertyKey] === true;
                  
                  // Simplified logic: required = person must have property, !required = person must NOT have property
                  return filterTyped.required ? personHasProperty : !personHasProperty;
                });
              }) || [];
  
              if (applicablePeople.length === 0) {
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
  
              return applicablePeople.map(person => (
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
                    {Object.entries(currentRule.propertyFilters || {}).map(([propertyKey, filter]) => {
                      const filterTyped = filter as { required: boolean; value: boolean };
                      const propertyDisplayName = people?.[0]?.propertyNames?.[propertyKey] || propertyKey;
                      const personHasProperty = person.properties[propertyKey] === true;
                      const matchesFilter = filterTyped.required ? personHasProperty : !personHasProperty;
                      
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
                          title={`${propertyDisplayName}: ${filterTyped.required ? 'Must have property' : 'Must NOT have property'}`}
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
  
        {/* Rule Schedule Calendar */}
        <div style={{ marginBottom: '30px' }}>
          <UnifiedDateGrid
            title={`${currentRule.name} - Schedule`}
            data={currentRule}
            type="rule"
            onUpdateSchedule={updateRuleSchedule}
            onAddRepeatPattern={addRuleRepeatPattern}
            onRemoveRepeatPattern={removeRuleRepeatPattern}
            onAddRepeatException={addRuleRepeatException}
            onStopFutureRepeats={stopFutureRuleRepeats}
          />
        </div>
        
        <button
          onClick={() => removeRule({ id: currentRule._id as any })}
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
          DELETE RULE
        </button>
      </div>
    );
  }

  export default function RulesTab() {
    const rules = useQuery(api.people.listRules) as Rule[] | undefined;
    const people = useQuery(api.people.list) as Person[] | undefined;
    const addRule = useMutation(api.people.addRule);
    const updateRuleName = useMutation(api.people.updateRuleName);
    const removeRule = useMutation(api.people.removeRule);
    
    const rulesLoading = rules === undefined;

    const [showingRulePage, setShowingRulePage] = useState<Rule | null>(null);
    const [editingRuleName, setEditingRuleName] = useState<string | null>(null);
    const [newRuleName, setNewRuleName] = useState('');
  
    // Auto-start editing for newly created rules with default name
    useEffect(() => {
      if (rules && rules.length > 0) {
        const latestRule = rules[0]; // rules are ordered by creation time desc
        if (latestRule.name === "new rule" && editingRuleName !== latestRule._id) {
          setEditingRuleName(latestRule._id);
          setNewRuleName(latestRule.name);
        }
      }
    }, [rules, editingRuleName]);
  
    const handleAddRule = async () => {
      await addRule({ name: "new rule" });
    };
  
    const handleSaveRuleName = async () => {
      if (!editingRuleName) return;
      
      const trimmedName = newRuleName.trim();
      if (!trimmedName) {
        handleCancelRuleEdit();
        return;
      }
  
      // Check for duplicates (case-insensitive)
      const nameExists = rules?.some(rule => 
        rule.name.toLowerCase() === trimmedName.toLowerCase() && 
        rule._id !== editingRuleName
      );
      
      if (nameExists) {
        // Don't save if name already exists
        return;
      }
  
      await updateRuleName({ id: editingRuleName as any, name: trimmedName });
      setEditingRuleName(null);
      setNewRuleName('');
    };
  
    const handleCancelRuleEdit = async () => {
      if (!editingRuleName) return;
      
      // If it's a "new rule", delete it
      const rule = rules?.find(r => r._id === editingRuleName);
      if (rule && rule.name === "new rule") {
        await removeRule({ id: rule._id as any });
      }
      
      setEditingRuleName(null);
      setNewRuleName('');
    };
  
    if (showingRulePage) {
      if (rulesLoading) {
        return (
          <div style={{ padding: '20px' }}>
            <div style={{
              padding: '16px',
              border: '2px solid #000000',
              backgroundColor: '#ffffff',
              textAlign: 'center',
              fontSize: '14px',
              color: '#000000'
            }}>
              Loading rule...
            </div>
          </div>
        );
      }
      return (
        <RulePage 
          rule={showingRulePage} 
          onBack={() => setShowingRulePage(null)}
          people={people}
        />
      );
    }
  
    if (rulesLoading) {
      return (
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px' }}>
            RULES
          </h2>
          <div style={{
            padding: '16px',
            border: '2px solid #000000',
            backgroundColor: '#ffffff',
            textAlign: 'center',
            fontSize: '14px',
            color: '#000000'
          }}>
            Loading rules...
          </div>
        </div>
      );
    }

    return (
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px' }}>
          RULES
        </h2>
        
        <div style={{ display: 'grid', gap: '12px', marginBottom: '20px' }}>
          {rules?.map((rule) => (
            <div
              key={rule._id}
              style={{
                padding: '16px',
                border: '2px solid #000000',
                backgroundColor: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              {editingRuleName === rule._id ? (
                <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                  <input
                    type="text"
                    value={newRuleName}
                    onChange={(e) => setNewRuleName(e.target.value)}
                    placeholder="new rule"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveRuleName();
                      } else if (e.key === 'Escape') {
                        handleCancelRuleEdit();
                      }
                    }}
                    onBlur={() => {
                      // Small delay to allow onClick events to fire first
                      setTimeout(() => {
                        if (newRuleName.trim()) {
                          handleSaveRuleName();
                        } else {
                          handleCancelRuleEdit();
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
                    onClick={() => setShowingRulePage(rule)}
                  >
                    {rule.name}
                  </span>
                  <span style={{ fontSize: '12px', color: '#666666' }}>
                    {Object.keys(rule.propertyFilters || {}).length} filters
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
        
        <button
          onClick={handleAddRule}
          style={{
            width: '100%',
            padding: '16px',
            fontSize: '16px',
            fontWeight: 'bold',
            backgroundColor: '#ffffff',
            color: '#000000',
            border: '2px solid #000000',
            cursor: 'pointer'
          }}
        >
          + ADD RULE
        </button>
      </div>
    );
  }