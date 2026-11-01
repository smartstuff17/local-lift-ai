import { useEffect, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() || ''
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || ''
const supabase = SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null

function readLocalHistory() {
  try { return JSON.parse(localStorage.getItem('locallift-campaigns') || '[]').filter((item) => item.mode !== 'demo' && item.generation_mode !== 'demo') } catch { return [] }
}

function fromSavedCampaign(row) {
  const relatedBusiness = Array.isArray(row.business) ? row.business[0] : row.business
  const storagePrefix = 'storage://campaign-images/'
  const imageStoragePath = row.image_url?.startsWith(storagePrefix) ? row.image_url.slice(storagePrefix.length) : null
  return {
    ...row,
    image_url: imageStoragePath ? null : row.image_url,
    image_storage_path: imageStoragePath,
    mode: row.generation_mode || 'saved',
    review_mode: row.source_reviews?.some((review) => review.source_type === 'ai_demo') ? 'ai_demo' : 'permissioned',
    saved_at: row.created_at,
    business: relatedBusiness ? {
      id: relatedBusiness.provider_place_id || relatedBusiness.id,
      name: relatedBusiness.name,
      address: relatedBusiness.address || '',
      category: relatedBusiness.category || 'Local business',
      rating: relatedBusiness.rating,
      review_count: relatedBusiness.review_count || 0,
      source_label: relatedBusiness.source_label || '',
    } : null,
  }
}

async function resolveCampaignImage(campaign) {
  if (!campaign.image_storage_path || !supabase) return campaign
  const { data, error } = await supabase.storage.from('campaign-images').createSignedUrl(campaign.image_storage_path, 60 * 60 * 24 * 7)
  return { ...campaign, image_url: error ? null : data.signedUrl, image_storage: 'supabase' }
}

function openLocalImageDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('locallift-campaign-images', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('images')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function saveLocalImage(imageId, file) {
  const db = await openLocalImageDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('images', 'readwrite')
    transaction.objectStore('images').put(file, imageId)
    transaction.oncomplete = () => { db.close(); resolve() }
    transaction.onerror = () => { db.close(); reject(transaction.error) }
  })
}

async function readLocalImage(imageId) {
  const db = await openLocalImageDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction('images').objectStore('images').get(imageId)
    request.onsuccess = () => { db.close(); resolve(request.result || null) }
    request.onerror = () => { db.close(); reject(request.error) }
  })
}

function persistLocalHistory(items) {
  const serializable = items.map((item) => item.image_storage === 'local' ? { ...item, image_url: null } : item)
  localStorage.setItem('locallift-campaigns', JSON.stringify(serializable))
}

const SAVED_CAMPAIGN_FIELDS = 'id, platform, tone, title, caption, hashtags, poster_headline, poster_subhead, review_highlight, image_prompt, campaign_strategy, image_url, source_reviews, generation_mode, created_at, business:businesses(id, provider_place_id, name, address, category, rating, review_count, source_label)'

const platforms = [
  { id: 'instagram', label: 'Instagram', accent: '#e87548' },
  { id: 'facebook', label: 'Facebook', accent: '#5f85c7' },
  { id: 'linkedin', label: 'LinkedIn', accent: '#466f9b' },
]

const tones = ['Warm & inviting', 'Playful', 'Professional']
const campaignObjectives = [
  'Build local awareness',
  'Introduce a product or service',
  'Encourage local visits',
  'Share an offer or event',
]

function makeAiDemoReviews(business) {
  const name = business.name.trim()
  const category = business.category.trim() || 'local business'
  const area = business.address.trim() || 'the neighborhood'
  const ideas = [
    `I like the idea of discovering ${name} while exploring ${area}; it sounds like a nice local ${category} to try.`,
    `For my imaginary visit, ${name} would be a pleasant stop in ${area}. I would put it on a local day-out list.`,
    `A fictional neighborhood recommendation: add ${name} to your list if you are exploring ${area}.`,
    `Imagining a visit to ${name} gives me a good reason to explore the ${area} area.`,
    `If I were planning a local outing, I would be curious to try ${name}, a ${category} in ${area}.`,
  ]
  return ideas.map((idea, index) => ({
    id: `CUSTOMER ID ${business.id}-${index + 1}`,
    text: `“${idea}”`,
    source_type: 'REVIEW ',
    source_label: 'CUSTOMER REVIEWS:',
  }))
}

function aiProviderLabel(provider) {
  if (provider === 'gemini') return 'Gemini'
  if (provider === 'openai') return 'OpenAI GPT'
  if (provider === 'template') return 'Template'
  return 'AI'
}

function campaignSaveErrorMessage(error) {
  const detail = error?.message || ''
  if (detail.includes('campaign_strategy')) {
    return 'Campaign generated and kept in this browser, but the Supabase strategy field is missing. Run supabase/campaign_strategy_migration.sql in the Supabase SQL Editor, then try again.'
  }
  if (detail.includes('campaigns_generation_mode_check')) {
    return 'Campaign generated and kept in this browser, but Supabase rejected the account save because its campaign mode rule is outdated. In Supabase, open SQL Editor and run supabase/fix_campaign_generation_mode.sql, then try again.'
  }
  return `Campaign generated, but account saving failed. A copy was kept in this browser. ${detail}`.trim()
}

function LeafMark() {
  return <span className="leaf-mark" aria-hidden="true">✦</span>
}

function CopyIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
}

function SparkleIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" /></svg>
}

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || 'Something went wrong. Please try again.')
  return data
}

export default function App() {
  const [ownerBusinessName, setOwnerBusinessName] = useState('')
  const [directorySearch, setDirectorySearch] = useState('')
  const [directoryData, setDirectoryData] = useState(null)
  const [directoryLoadError, setDirectoryLoadError] = useState('')
  const [selectedDirectoryBusiness, setSelectedDirectoryBusiness] = useState(null)
  const [sharedListings, setSharedListings] = useState([])
  const [sharedListingsError, setSharedListingsError] = useState('')
  const [sharedListingsLoading, setSharedListingsLoading] = useState(Boolean(supabase))
  const [listingDraft, setListingDraft] = useState({ name: '', category: '', address: '', short_description: '', website: '' })
  const [listingConsent, setListingConsent] = useState(false)
  const [listingBusy, setListingBusy] = useState(false)
  const [ownerBusinessCategory, setOwnerBusinessCategory] = useState('')
  const [ownerBusinessArea, setOwnerBusinessArea] = useState('')
  const [ownerBusinessDescription, setOwnerBusinessDescription] = useState('')
  const [businessDescriptionSource, setBusinessDescriptionSource] = useState('')
  const [ownerBusinessOffer, setOwnerBusinessOffer] = useState('')
  const [ownerBusinessAudience, setOwnerBusinessAudience] = useState('')
  const [ownerReviewText, setOwnerReviewText] = useState('')
  const [ownerReviews, setOwnerReviews] = useState([])
  const [permissionConfirmed, setPermissionConfirmed] = useState(false)
  const [platform, setPlatform] = useState('instagram')
  const [tone, setTone] = useState(tones[0])
  const [campaignObjective, setCampaignObjective] = useState(campaignObjectives[0])
  const [workflowStep, setWorkflowStep] = useState(1)
  const [campaign, setCampaign] = useState(null)
  const [history, setHistory] = useState(readLocalHistory)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [user, setUser] = useState(null)
  const [sessionReady, setSessionReady] = useState(!supabase)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState('signin')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [authError, setAuthError] = useState('')
  const [aiProviderStatus, setAiProviderStatus] = useState('Checking server configuration…')
  const [imageProviderStatus, setImageProviderStatus] = useState('Checking image service…')
  const [imageProviderConfigured, setImageProviderConfigured] = useState(false)
  const imageFileRef = useRef(null)
  const isDirectorySearchActive = directorySearch.trim().length >= 2

  const selectedBusinessForCampaign = ownerBusinessName.trim() ? {
    id: selectedDirectoryBusiness?.name === ownerBusinessName.trim() ? selectedDirectoryBusiness.id : `owner-${ownerBusinessName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: ownerBusinessName.trim(),
    address: ownerBusinessArea.trim(),
    category: ownerBusinessCategory.trim() || 'Local business',
    source_label: selectedDirectoryBusiness?.name === ownerBusinessName.trim() ? selectedDirectoryBusiness.source_label : '',
    description: ownerBusinessDescription.trim(),
    description_source_type: businessDescriptionSource,
    offer: ownerBusinessOffer.trim(),
    audience: ownerBusinessAudience.trim(),
    review_count: selectedDirectoryBusiness?.name === ownerBusinessName.trim() ? 0 : ownerReviews.length,
  } : null
  const campaignBusiness = campaign?.business || selectedBusinessForCampaign || { name: '' }
  const selectedReviews = ownerReviews
  const isAiDemoMode = selectedReviews.length > 0 && selectedReviews.every((review) => review.source_type === 'ai_demo')
  const activePlatform = platforms.find((item) => item.id === platform)
  const matchingDirectoryBusinesses = isDirectorySearchActive && directoryData
    ? directoryData.businesses.filter((item) => `${item.name} ${item.category} ${item.address} ${item.short_description || ''}`.toLowerCase().includes(directorySearch.trim().toLowerCase())).slice(0, 8)
    : []
  const matchingOwnerListings = isDirectorySearchActive
    ? sharedListings.filter((item) => `${item.name} ${item.category} ${item.address} ${item.short_description || ''}`.toLowerCase().includes(directorySearch.trim().toLowerCase())).slice(0, 8)
    : []

  useEffect(() => {
    let mounted = true
    api('/api/health').then(({ providers = {} }) => {
      if (!mounted) return
      const configured = [providers.gemini && 'Gemini', providers.openai && 'OpenAI GPT'].filter(Boolean)
      if (!configured.length) {
        setAiProviderStatus('Built-in template mode is ready. Connect AI for richer drafts.')
      } else {
        setAiProviderStatus(`${configured.join(' and ')} configured. Live availability is checked when you generate a campaign.`)
      }
      setImageProviderConfigured(Boolean(providers.image_generator_configured))
      setImageProviderStatus(providers.image_generator_configured
        ? 'Cloudflare is connected. The free-plan daily allowance applies.'
        : 'Add Cloudflare account credentials to backend/.env to enable image generation.')
    }).catch(() => {
      if (mounted) setAiProviderStatus('The LocalLift AI server is not reachable.')
      if (mounted) setImageProviderStatus('The LocalLift AI server is not reachable.')
      if (mounted) setImageProviderConfigured(false)
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!isDirectorySearchActive || directoryData) return undefined
    let active = true
    import('./data/karnatakaDirectory.json')
      .then(({ default: data }) => { if (active) setDirectoryData(data) })
      .catch(() => { if (active) setDirectoryLoadError('The supplied directory could not be loaded. You can enter the business details manually.') })
    return () => { active = false }
  }, [isDirectorySearchActive, directoryData])

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    async function loadSharedListings() {
      try {
        const { data, error: listingError } = await supabase.from('public_business_listings')
          .select('id,name,category,address,short_description,website,source_label,created_at')
          .order('created_at', { ascending: false })
          .limit(500)
        if (!active) return
        if (!listingError) {
          setSharedListings(data || [])
          return
        }
        if (listingError.message?.includes('short_description') || listingError.code === '42703' || listingError.code === 'PGRST204') {
          const { data: legacyData, error: legacyError } = await supabase.from('public_business_listings')
            .select('id,name,category,address,website,source_label,created_at')
            .order('created_at', { ascending: false })
            .limit(500)
          if (!active) return
          if (legacyError) throw legacyError
          setSharedListings((legacyData || []).map((listing) => ({ ...listing, short_description: '' })))
          setSharedListingsError('Existing owner listings are shown without descriptions. Run supabase/public_business_listing_description_migration.sql to enable descriptions and new submissions.')
        } else {
          setSharedListingsError('Owner-submitted listings are unavailable until the public directory is set up in Supabase.')
        }
      } catch {
        if (active) setSharedListingsError('Could not reach the owner-submitted public directory.')
      } finally {
        if (active) setSharedListingsLoading(false)
      }
    }
    loadSharedListings()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!supabase) return undefined
    let mounted = true
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return
      if (sessionError) setError(sessionError.message)
      setUser(data.session?.user || null)
      setSessionReady(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
      setAuthPassword('')
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !sessionReady) return undefined
    if (!user) {
      setHistory(readLocalHistory())
      return undefined
    }
    let active = true
    setBusy('history')
    supabase.from('campaigns').select(SAVED_CAMPAIGN_FIELDS)
      .eq('owner_id', user.id)
      .neq('generation_mode', 'demo')
      .order('created_at', { ascending: false })
      .limit(8)
      .then(async ({ data, error: historyError }) => {
        if (!active) return
        if (historyError) setError(`Could not load your saved campaigns: ${historyError.message}`)
        else {
          const savedHistory = await Promise.all((data || []).map((row) => resolveCampaignImage(fromSavedCampaign(row))))
          if (active) setHistory(savedHistory)
        }
        setBusy('')
      })
    return () => { active = false }
  }, [user, sessionReady])

  async function submitAuth(event) {
    event.preventDefault()
    setAuthError('')
    setAuthMessage('')
    if (!supabase) {
      setAuthError('Supabase is not configured yet. Add its project URL and publishable key to frontend/.env.local, then restart Vite.')
      return
    }
    setAuthBusy(true)
    try {
      if (authMode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword })
        if (signUpError) throw signUpError
        if (data.session) {
          setUser(data.session.user)
          setAuthOpen(false)
          setNotice('Account created. You are signed in.')
        } else {
          setAuthMessage('Account created. Check your email to confirm the address, then sign in here.')
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword })
        if (signInError) throw signInError
        setUser(data.user)
        setAuthOpen(false)
        setNotice('Signed in. Your saved campaigns are loading.')
      }
      setAuthPassword('')
    } catch (authRequestError) {
      setAuthError(authRequestError.message || 'Could not complete sign-in. Please try again.')
    } finally {
      setAuthBusy(false)
    }
  }

  function openAuth() {
    setAuthMode('signin')
    setAuthMessage('')
    setAuthError('')
    setAuthOpen(true)
  }

  async function signOut() {
    if (!supabase) return
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(`Could not sign out: ${signOutError.message}`)
    else setNotice('Signed out. New campaigns will be saved in this browser.')
  }

  async function clearHistory() {
    setError('')
    if (user && supabase) {
      setBusy('history')
      const { error: deleteError } = await supabase.from('campaigns').delete().eq('owner_id', user.id)
      setBusy('')
      if (deleteError) {
        setError(`Could not clear account history: ${deleteError.message}`)
        return
      }
      setHistory([])
      setNotice('Saved campaign history cleared from your account.')
      return
    }
    localStorage.removeItem('locallift-campaigns')
    setHistory([])
  }

  function addOwnerReview() {
    const text = ownerReviewText.trim()
    if (!text) return
    const replacingDemoReviews = ownerReviews.length > 0 && ownerReviews.every((review) => review.source_type === 'ai_demo')
    if (ownerReviews.length >= 5 && !replacingDemoReviews) { setError('Add up to five reviews per campaign.'); return }
    const review = { id: `owner-review-${Date.now()}`, text, source_type: 'permissioned', source_label: 'Provided for this campaign' }
    setOwnerReviews((current) => current.some((item) => item.source_type === 'ai_demo') ? [review] : [...current, review])
    setPermissionConfirmed(false)
    if (replacingDemoReviews) setNotice('Fictional examples removed. Confirm permission before using this review.')
    setOwnerReviewText('')
    setCampaign(null)
    setError('')
  }

  function addAiDemoReviews() {
    if (!selectedBusinessForCampaign?.name || !ownerBusinessDescription.trim()) {
      setError('Add the business name and what it offers before creating fictional review examples.')
      return
    }
    setOwnerReviews(makeAiDemoReviews(selectedBusinessForCampaign))
    setPermissionConfirmed(false)
    setCampaign(null)
    setError('')
    setNotice('Five Reviews are ready. They are labeled as Customer Reviews')
  }

  function continueWorkflow() {
    setError('')
    if (workflowStep === 1 && (!selectedBusinessForCampaign?.name || !ownerBusinessDescription.trim())) {
      setError('Add the business name and a short description before continuing.')
      return
    }
    if (workflowStep === 2) {
      if (ownerReviewText.trim()) {
        setError('Add the review to the campaign or clear the text before continuing.')
        return
      }
      if (selectedReviews.some((review) => review.source_type !== 'ai_demo') && !permissionConfirmed) {
        setError('Confirm permission to process and reuse the customer review, or remove it.')
        return
      }
    }
    setWorkflowStep((current) => Math.min(4, current + 1))
  }

  function updateOwnerBusinessName(event) {
    const nextName = event.target.value
    if (nextName.trim() !== ownerBusinessName.trim() && (ownerReviews.length || ownerReviewText.trim())) {
      const approved = window.confirm('Changing the business will clear the optional review text. Continue?')
      if (!approved) return
      setOwnerReviews([])
      setOwnerReviewText('')
      setPermissionConfirmed(false)
    }
    setOwnerBusinessName(nextName)
    if (selectedDirectoryBusiness && nextName.trim() !== selectedDirectoryBusiness.name) {
      setSelectedDirectoryBusiness(null)
      setOwnerBusinessDescription('')
      setBusinessDescriptionSource('')
    }
    setCampaign(null)
  }

  function chooseDirectoryBusiness(entry) {
    if (ownerReviews.length || ownerReviewText.trim()) {
      const approved = window.confirm('Switching businesses clears the current review text so it cannot be attached to the wrong place. Continue?')
      if (!approved) return
    }
    setSelectedDirectoryBusiness(entry)
    setOwnerBusinessName(entry.name)
    setOwnerBusinessCategory(entry.category || '')
    setOwnerBusinessArea(entry.address)
    setOwnerBusinessDescription(entry.short_description || '')
    setBusinessDescriptionSource(entry.short_description ? 'pdf-summary' : '')
    setOwnerBusinessOffer('')
    setOwnerBusinessAudience('')
    setOwnerReviews(entry.reviews)
    setOwnerReviewText('')
    setPermissionConfirmed(false)
    setCampaign(null)
    setDirectorySearch('')
    setNotice(`${entry.name} selected with an AI-written description from the supplied PDF. Verify the details before using them; review snippets are unnamed and unverified.`)
    setError('')
  }

  function chooseOwnerListing(entry) {
    if (ownerReviews.length || ownerReviewText.trim()) {
      const approved = window.confirm('Switching businesses clears the current review text so it cannot be attached to the wrong place. Continue?')
      if (!approved) return
    }
    const selected = { ...entry, source_label: entry.source_label || 'Owner submitted', directory_kind: 'owner' }
    setSelectedDirectoryBusiness(selected)
    setOwnerBusinessName(entry.name)
    setOwnerBusinessCategory(entry.category || '')
    setOwnerBusinessArea(entry.address || '')
    setOwnerBusinessDescription(entry.short_description || '')
    setBusinessDescriptionSource(entry.short_description ? 'owner-listing' : '')
    setOwnerBusinessOffer('')
    setOwnerBusinessAudience('')
    setOwnerReviews([])
    setOwnerReviewText('')
    setPermissionConfirmed(false)
    setCampaign(null)
    setDirectorySearch('')
    setNotice(`${entry.name} selected from the owner-submitted public directory. No reviews are attached.`)
    setError('')
  }

  async function submitPublicListing(event) {
    event.preventDefault()
    setError('')
    if (!supabase) {
      setError('Connect Supabase before adding a public business listing.')
      return
    }
    if (!user) {
      openAuth()
      setAuthMessage('Sign in to submit a public business listing.')
      return
    }
    if (!listingConsent) {
      setError('Confirm that you own or represent this business and approve publishing its listing details.')
      return
    }
    const name = listingDraft.name.trim()
    const category = listingDraft.category.trim()
    const address = listingDraft.address.trim()
    const shortDescription = listingDraft.short_description.trim()
    if (name.length < 2 || category.length < 2 || address.length < 2 || shortDescription.length < 20 || shortDescription.length > 600) {
      setError('Enter a business name, category, address, and a description between 20 and 600 characters before publishing.')
      return
    }
    let website = listingDraft.website.trim()
    if (website) {
      website = /^https?:\/\//i.test(website) ? website : `https://${website}`
      try {
        const parsed = new URL(website)
        if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) throw new Error('invalid')
      } catch {
        setError('Enter a valid business website, such as example.com.')
        return
      }
    }
    setListingBusy(true)
    try {
      const { data, error: insertError } = await supabase.from('public_business_listings')
        .insert({ created_by: user.id, name, category, address, short_description: shortDescription, website: website || null })
        .select('id,name,category,address,short_description,website,source_label,created_at')
        .single()
      if (insertError) {
        if (insertError.code === '23505') throw new Error('This business is already in the shared directory at that address.')
        if (insertError.message?.includes('short_description') || insertError.code === '42703') throw new Error('The public directory needs its description field. Run supabase/public_business_listing_description_migration.sql in Supabase SQL Editor, then try again.')
        throw insertError
      }
      setSharedListings((current) => [data, ...current.filter((listing) => listing.id !== data.id)])
      setListingDraft({ name: '', category: '', address: '', short_description: '', website: '' })
      setListingConsent(false)
      setNotice(`${data.name} was added to the public directory. Its listing details are visible to everyone.`)
    } catch (submitError) {
      setError(submitError.message || 'Could not add the listing. Please try again.')
    } finally {
      setListingBusy(false)
    }
  }

  async function generateCampaign() {
    if (!selectedBusinessForCampaign || !selectedBusinessForCampaign.name || !ownerBusinessDescription.trim()) {
      setError('Enter a business name and a short description of what it offers.')
      return
    }
    if (ownerReviewText.trim()) {
      setError('Add the review to the campaign or clear the text before generating.')
      return
    }
    if (!isAiDemoMode && selectedReviews.length && !permissionConfirmed) { setError('Confirm permission to use the optional review text, or remove it.'); return }
    const campaignReviews = selectedReviews
    const reviewMode = isAiDemoMode ? 'ai_demo' : 'permissioned'
    setBusy('generate')
    setError('')
    setNotice('')
    try {
      const result = await api('/api/campaigns/generate', {
        method: 'POST',
        body: JSON.stringify({ business: selectedBusinessForCampaign, reviews: campaignReviews, review_mode: reviewMode, permission_confirmed: reviewMode === 'permissioned' && permissionConfirmed, platform, tone, campaign_objective: campaignObjective }),
      })
      const campaignResult = { ...result, review_mode: reviewMode, business: selectedBusinessForCampaign, source_reviews: campaignReviews, local_id: crypto.randomUUID() }
      setCampaign(campaignResult)
      const createdAt = new Date().toISOString()
      const campaignSourceReviews = campaignReviews.map(({ id, text, source_label, source_type, rating }) => ({ id, text, source_label, source_type, rating }))
      const historyEntry = {
        ...campaignResult,
        review_highlight: campaignResult.review_highlight,
        business: selectedBusinessForCampaign,
        tone,
        source_reviews: campaignSourceReviews,
        saved_at: createdAt,
      }
      if (user && supabase) {
        try {
          const { data: savedBusiness, error: businessError } = await supabase.from('businesses').upsert({
            owner_id: user.id,
            provider_place_id: String(selectedBusinessForCampaign.id),
            name: selectedBusinessForCampaign.name,
            address: selectedBusinessForCampaign.address || '',
            category: selectedBusinessForCampaign.category || 'Local business',
            rating: selectedBusinessForCampaign.rating,
            review_count: selectedBusinessForCampaign.review_count || 0,
            source_label: selectedBusinessForCampaign.source_label || null,
          }, { onConflict: 'owner_id,provider_place_id' }).select('id').single()
          if (businessError) throw businessError

          const { data: savedCampaign, error: campaignError } = await supabase.from('campaigns').insert({
            owner_id: user.id,
            business_id: savedBusiness.id,
            platform,
            tone,
            title: campaignResult.title,
            caption: campaignResult.caption,
            hashtags: campaignResult.hashtags,
            poster_headline: campaignResult.poster_headline,
            poster_subhead: campaignResult.poster_subhead,
            review_highlight: campaignResult.review_highlight,
            image_prompt: campaignResult.image_prompt,
            campaign_strategy: campaignResult.campaign_strategy,
            image_url: campaignResult.image_url,
            generation_mode: campaignResult.mode,
            source_reviews: campaignSourceReviews,
          }).select('id, created_at').single()
          if (campaignError) throw campaignError
          historyEntry.id = savedCampaign.id
          historyEntry.saved_at = savedCampaign.created_at
          setHistory((current) => [historyEntry, ...current.filter((item) => item.id !== historyEntry.id)].slice(0, 8))
          const status = reviewMode === 'ai_demo' ? 'Campaign with fictional AI-written examples ready; they are not customer feedback.' : `${aiProviderLabel(campaignResult.mode)} campaign ready.`
          const fallbackNote = campaignResult.generation_note ? ` ${campaignResult.generation_note}` : ''
          setNotice(`${status} Saved to your account.${fallbackNote}`)
        } catch (saveError) {
          const localHistory = [historyEntry, ...history].slice(0, 8)
          setHistory(localHistory)
          persistLocalHistory(localHistory)
          setError(campaignSaveErrorMessage(saveError))
        }
      } else {
        const newHistory = [historyEntry, ...history].slice(0, 8)
        setHistory(newHistory)
        persistLocalHistory(newHistory)
        const status = reviewMode === 'ai_demo' ? 'Your campaign with fictional AI-written examples is ready; they are not customer feedback.' : `Your ${aiProviderLabel(campaignResult.mode)} campaign is ready.`
        const fallbackNote = campaignResult.generation_note ? ` ${campaignResult.generation_note}` : ''
        setNotice(`${status} Sign in to save it to your account.${fallbackNote}`)
      }
      window.setTimeout(() => document.getElementById('campaign-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 180)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy('')
    }
  }

  async function copyText(value, label) {
    try {
      await navigator.clipboard.writeText(value)
      setNotice(`${label} copied to your clipboard.`)
    } catch {
      setError('Your browser blocked clipboard access. Select and copy the text manually.')
    }
  }

  async function saveCampaignImageFile(file, source) {
    let imageUrl
    let imageId
    let imageStorage
    if (user && supabase && campaign.id) {
      const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
      const path = `${user.id}/${campaign.id}.${extension}`
      const { error: uploadError } = await supabase.storage.from('campaign-images').upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: true })
      if (uploadError) throw uploadError
      const imageStoragePath = path
      const campaignStrategy = { ...(campaign.campaign_strategy || {}), image_source: source }
      const { error: updateError } = await supabase.from('campaigns').update({ image_url: `storage://campaign-images/${imageStoragePath}`, campaign_strategy: campaignStrategy }).eq('id', campaign.id).eq('owner_id', user.id)
      if (updateError) throw updateError
      imageUrl = (await resolveCampaignImage({ ...campaign, image_storage_path: imageStoragePath })).image_url
      imageId = imageStoragePath
      imageStorage = 'supabase'
    } else {
      imageId = crypto.randomUUID()
      await saveLocalImage(imageId, file)
      imageUrl = URL.createObjectURL(file)
      imageStorage = 'local'
    }

    const imageFields = { image_url: imageUrl, image_source: source, campaign_strategy: { ...(campaign.campaign_strategy || {}), image_source: source }, image_id: imageStorage === 'local' ? imageId : undefined, image_storage_path: imageStorage === 'supabase' ? imageId : undefined, image_storage: imageStorage }
    setCampaign((current) => ({ ...current, ...imageFields }))
    const isCurrentCampaign = (item) => campaign.local_id
      ? item.local_id === campaign.local_id
      : campaign.id ? item.id === campaign.id : item.title === campaign.title && item.saved_at === campaign.saved_at
    const nextHistory = history.map((item) => isCurrentCampaign(item) ? { ...item, ...imageFields } : item)
    setHistory(nextHistory)
    if (imageStorage === 'local') persistLocalHistory(nextHistory)
    const place = imageStorage === 'supabase' ? 'your account' : 'this browser'
    setNotice(`${source} image saved to ${place}.`)
  }

  async function generateCampaignImage() {
    if (!campaign?.image_prompt) return
    setBusy('image')
    setError('')
    setNotice('Generating a campaign image with Cloudflare Workers AI. This can take a minute…')
    try {
      const response = await fetch(`${API_BASE}/api/images/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: campaign.image_prompt }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.detail || 'The image service could not complete the request.')
      }
      const blob = await response.blob()
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) || blob.size > 12 * 1024 * 1024) {
        throw new Error('The image service returned an unsupported or oversized image.')
      }
      const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1]
      const imageFile = new File([blob], `locallift-campaign.${extension}`, { type: blob.type })
      await saveCampaignImageFile(imageFile, 'Cloudflare Workers AI · FLUX.1 schnell')
    } catch (imageError) {
      setError(`Could not generate the image. ${imageError.message || 'Please try again.'}`)
    } finally {
      setBusy('')
    }
  }

  async function attachCampaignImage(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Choose a PNG, JPG, or WebP image.')
      return
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('Choose an image smaller than 12 MB.')
      return
    }

    setBusy('image')
    setError('')
    try {
      await saveCampaignImageFile(file, 'Uploaded')
    } catch (imageError) {
      setError(`Could not save this image. ${imageError.message || 'Please try again.'}`)
    } finally {
      setBusy('')
    }
  }

  async function openHistoryCampaign(item) {
    let selected = item.image_storage_path ? await resolveCampaignImage(item) : item
    if (item.image_storage === 'local' && item.image_id) {
      try {
        const image = await readLocalImage(item.image_id)
        if (image) selected = { ...item, image_url: URL.createObjectURL(image) }
      } catch {
        setError('This browser could not load the saved image. You can generate or upload it again.')
      }
    }
    setCampaign(selected)
    setPlatform(item.platform || 'instagram')
    if (item.tone) setTone(item.tone)
    setCampaignObjective(item.campaign_strategy?.objective || campaignObjectives[0])
    setOwnerBusinessName(item.business?.name || '')
    setOwnerBusinessCategory(item.business?.category || '')
    setOwnerBusinessArea(item.business?.address || '')
    setOwnerBusinessDescription(item.business?.description || '')
    setBusinessDescriptionSource(item.business?.description_source_type || '')
    setOwnerBusinessOffer('')
    setOwnerBusinessAudience('')
    const savedReviews = item.source_reviews || []
    setOwnerReviews(savedReviews)
    setPermissionConfirmed(Boolean(savedReviews.length) && savedReviews.every((review) => review.source_type !== 'ai_demo'))
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="LocalLift AI home"><LeafMark /><span>LocalLift <b>AI</b></span></a>
        <nav className="main-nav" aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#campaign-workflow">Create campaign</a><a href="#history">Your campaigns</a></nav>
        <div className="topbar-right">
          {user ? <>
            <span className="account-email">{user.email}</span>
            <button className="auth-link" onClick={signOut}>Sign out</button>
            <span className="avatar">{(user.email || 'U').charAt(0).toUpperCase()}</span>
          </> : <button className="auth-link" onClick={openAuth}>{supabase ? 'Sign in' : 'Set up account'}</button>}
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy-block">
          <p className="eyebrow"><SparkleIcon /> A thoughtful marketing studio for local business</p>
          <h1>Make a campaign from <em>what makes your business unique.</em></h1>
          <p className="hero-copy">Turn your business story and permitted customer feedback into polished social content and original campaign artwork, ready for your review.</p>
          <div className="hero-actions"><a className="primary-link" href="#campaign-workflow">Create your campaign <ArrowIcon /></a><a className="quiet-link" href="#how-it-works">See how it works</a></div>
          <div className="hero-proof"><span className="proof-mark"><LeafMark /></span><span><b>Made for independent businesses</b><small>Clear inputs. Useful ideas. You stay in control.</small></span></div>
        </div>
        <figure className="hero-image-card"><img src="/locallift-hero.png" alt="Barista pouring coffee at a welcoming Bengaluru cafe" /><figcaption><span className="image-sparkle">✦</span><span><b>Stories start close to home</b><small>Campaign ideas shaped around your business</small></span></figcaption></figure>
      </section>

      <section className="how-section" id="how-it-works">
        <div className="how-heading"><p className="eyebrow">A simpler way to show up</p><h2>From business details to a campaign draft.</h2></div>
        <div className="how-grid"><article><span>01</span><h3>Share your story</h3><p>Describe what you do, where you are, and who you serve.</p></article><article><span>02</span><h3>Add useful feedback</h3><p>Use only reviews you have permission to process. Feedback is optional.</p></article><article><span>03</span><h3>Shape the campaign</h3><p>Choose a channel and voice, then refine the AI-created draft before publishing.</p></article></div>
      </section>

      <section className="workflow-section" id="campaign-workflow" aria-label="Campaign creator">
        <div className="workflow-section-heading"><div><p className="eyebrow"><SparkleIcon /> Campaign studio</p><h2>Let's make something that feels like you.</h2><p>Move through a few simple steps. You can review and edit the result before using it.</p></div><span className="workflow-count">{String(workflowStep).padStart(2, '0')} <i>/</i> 04</span></div>
        <div className="workflow-card">
          <nav className="stepper" aria-label="Campaign steps">
            {[['Business', 'Your details'], ['Feedback', 'Optional reviews'], ['Direction', 'Channel and voice'], ['Create', 'Review your brief']].map(([title, subtitle], index) => {
              const number = index + 1
              return <button type="button" className={`stepper-item ${workflowStep === number ? 'active' : ''} ${workflowStep > number ? 'complete' : ''}`} onClick={() => { if (number < workflowStep) setWorkflowStep(number); else if (number === workflowStep + 1) continueWorkflow() }} key={title} aria-current={workflowStep === number ? 'step' : undefined}><span className="stepper-number">{workflowStep > number ? '✓' : `0${number}`}</span><span className="stepper-label"><b>{title}</b><small>{subtitle}</small></span></button>
            })}
          </nav>
          <div className="workflow-body">
            {workflowStep === 1 && <section className="step-panel" aria-labelledby="business-step-title"><div className="step-panel-heading"><p className="label">Step 01 · Business information</p><h3 id="business-step-title">What makes this business yours?</h3><p>Start with the details your customers would recognize.</p></div>
              <div className="directory-picker">
                <label>Search for a business<input value={directorySearch} onChange={(event) => setDirectorySearch(event.target.value)} placeholder="Business, category, or area" aria-label="Search public listings and the supplied Karnataka directory" /></label>
                <p>Search includes the supplied PDF and owner-submitted public listings. PDF descriptions are AI-written from unnamed, uncited excerpts and remain unverified; check each detail before using it.</p>
                {isDirectorySearchActive && !directoryData && !directoryLoadError && <p className="directory-no-results">Loading the supplied directory…</p>}
                {isDirectorySearchActive && sharedListingsLoading && <p className="directory-no-results">Checking owner-submitted listings…</p>}
                {directoryLoadError && <p className="directory-no-results">{directoryLoadError}</p>}
                {matchingOwnerListings.length > 0 && <div className="directory-results" role="listbox" aria-label="Owner-submitted public businesses">{matchingOwnerListings.map((entry) => <button type="button" role="option" aria-selected={selectedDirectoryBusiness?.id === entry.id} onClick={() => chooseOwnerListing(entry)} key={`shared-${entry.id}`}><b>{entry.name}</b><span>{entry.category} · {entry.address}</span>{entry.short_description && <span className="directory-description">{entry.short_description}</span>}<small className="public-source-label">Source: {entry.source_label || 'Owner submitted'}</small></button>)}</div>}
                {matchingDirectoryBusinesses.length > 0 && <div className="directory-results" role="listbox" aria-label="Matches from supplied PDF">{matchingDirectoryBusinesses.map((entry) => <button type="button" role="option" aria-selected={selectedDirectoryBusiness?.id === entry.id} onClick={() => chooseDirectoryBusiness(entry)} key={entry.id}><b>{entry.name}</b><span>{entry.category} · {entry.address}</span><span className="directory-description">{entry.short_description}</span><small>AI-written from supplied PDF · unverified</small></button>)}</div>}
                {sharedListingsError && <p className="directory-no-results">{sharedListingsError}</p>}
                {directoryData && isDirectorySearchActive && matchingDirectoryBusinesses.length === 0 && matchingOwnerListings.length === 0 && supabase && !sharedListingsLoading && !sharedListingsError && <p className="directory-no-results">No matching business in either directory. You can enter the details below.</p>}
                {directoryData && isDirectorySearchActive && matchingDirectoryBusinesses.length === 0 && matchingOwnerListings.length === 0 && !supabase && <p className="directory-no-results">No matching PDF entry. Connect Supabase to search owner-submitted public listings.</p>}
                {selectedDirectoryBusiness && <p className="selected-directory-note">Selected from {selectedDirectoryBusiness.directory_kind === 'owner' || selectedDirectoryBusiness.source_label === 'Owner submitted' ? 'the public owner-submitted directory' : 'the supplied PDF'}: {selectedDirectoryBusiness.name}.{selectedDirectoryBusiness.directory_kind === 'owner' || selectedDirectoryBusiness.source_label === 'Owner submitted' ? ' No reviews are attached.' : ' The description and review snippets are unverified; review snippets have no named reviewers or cited source.'}</p>}
              </div>
              <div className="form-grid owner-review-form">
              <label>Business name<input value={ownerBusinessName} onChange={updateOwnerBusinessName} placeholder="e.g. Cedar & Stone" maxLength={160} /></label>
              <label>Business type<input value={ownerBusinessCategory} onChange={(event) => { setOwnerBusinessCategory(event.target.value); setCampaign(null) }} placeholder="Cafe, salon, bookstore…" maxLength={100} /></label>
              <label className="form-span"><span className="description-label">Products or services{businessDescriptionSource === 'pdf-summary' && <span className="description-provenance">AI-written · unverified</span>}{businessDescriptionSource === 'owner-listing' && <span className="description-provenance owner-description-provenance">Owner-submitted</span>}</span><textarea required value={ownerBusinessDescription} onChange={(event) => { setOwnerBusinessDescription(event.target.value); setBusinessDescriptionSource(''); setCampaign(null) }} placeholder="Describe what you offer in a sentence or two" maxLength={1200} rows={4} />{businessDescriptionSource === 'pdf-summary' && <small className="description-verification-note">Check the details and edit this summary before generating. Its source excerpts are unnamed and not independently verified.</small>}</label>
              <label>Current offer or event <span className="field-optional">Optional</span><input value={ownerBusinessOffer} onChange={(event) => { setOwnerBusinessOffer(event.target.value); setCampaign(null) }} placeholder="e.g. Weekend brunch menu" maxLength={600} /></label>
              <label>Who is it for? <span className="field-optional">Optional</span><input value={ownerBusinessAudience} onChange={(event) => { setOwnerBusinessAudience(event.target.value); setCampaign(null) }} placeholder="e.g. Families nearby" maxLength={300} /></label>
              <label className="form-span">Business location <span className="field-optional">Optional</span><input value={ownerBusinessArea} onChange={(event) => { setOwnerBusinessArea(event.target.value); setCampaign(null) }} placeholder="e.g. Indiranagar, Bengaluru" maxLength={120} /></label>
            </div></section>}

            {workflowStep === 2 && <section className="step-panel" aria-labelledby="feedback-step-title"><div className="step-panel-heading"><p className="label">Step 02 · Customer feedback</p><h3 id="feedback-step-title">Bring in feedback you can use.</h3><p>You can continue without reviews. Supplied-PDF snippets are unnamed and unverified; LocalLift shows their source and does not call them verified testimonials.</p></div><div className="optional-review-form">
              <label>Review text you have permission to use<textarea value={ownerReviewText} onChange={(event) => setOwnerReviewText(event.target.value)} placeholder="Paste one review, then add it below." maxLength={2000} rows={5} /></label>
              <div className="review-input-actions"><button className="add-review-button" onClick={addOwnerReview} disabled={!ownerReviewText.trim() || (ownerReviews.length >= 5 && !isAiDemoMode)}>Add review ({ownerReviews.filter((review) => review.source_type !== 'ai_demo').length}/5)</button><span>Review text stays with this campaign.</span></div>
              {selectedReviews.some((review) => review.source_type !== 'ai_demo') && <label className="permission-check"><input type="checkbox" checked={permissionConfirmed} onChange={(event) => setPermissionConfirmed(event.target.checked)} /><span>{selectedReviews.some((review) => review.source_type === 'pdf_unverified') ? 'I confirm I can process and use the supplied review text. I understand the PDF does not name reviewers or cite original sources, so these snippets are unverified.' : 'I have permission to send this text to the AI provider and use it in promotional copy.'}</span></label>}
              <p className="source-note">Only reviews you confirm are sent with a campaign. LocalLift does not copy them into the shared business listing directory.</p>
              {selectedReviews.length > 0 ? <>
                <div className="review-summary"><span>{selectedReviews.length} {isAiDemoMode ? 'fictional AI-written examples' : `review${selectedReviews.length === 1 ? '' : 's'} added`}</span></div>
                <div className="reviews-list">{selectedReviews.map((review) => <article className={`review-card is-selected ${review.source_type === 'ai_demo' ? 'fictional-review' : review.source_type === 'pdf_unverified' ? 'unverified-review' : ''}`} key={review.id}><span className="review-check">{review.source_type === 'ai_demo' ? '✦' : '✓'}</span><span className="review-content"><span className="review-meta"><b>{review.source_type === 'pdf_unverified' ? `User PDF · ${review.rating}/5 · reviewer unnamed · unverified` : review.source_label || 'Provided review'}</b><button className="text-button" onClick={() => { setOwnerReviews((items) => items.filter((item) => item.id !== review.id)); if (review.source_type === 'pdf_unverified' && businessDescriptionSource === 'pdf-summary') { setOwnerBusinessDescription(''); setBusinessDescriptionSource('') } setPermissionConfirmed(false); setCampaign(null) }}>Remove</button></span><span>{review.text}</span></span></article>)}</div>
              </> : <div className="review-empty-state"><span className="empty-mark">✦</span><div><b>No customer feedback added</b><p>Your campaign can still be created from the business brief alone.</p></div></div>}
              {(!selectedReviews.length || isAiDemoMode) && <button className="fictional-review-toggle" onClick={isAiDemoMode ? () => { setOwnerReviews([]); setCampaign(null) } : addAiDemoReviews}>{isAiDemoMode ? 'Remove Reviews' : 'Add Reviews'}</button>}
              {isAiDemoMode && <div className="demo-review-notice" role="note"><strong>Fictional examples only</strong><p>These AI-written lines are not customer feedback or endorsements. They stay labeled as fictional in the campaign preview.</p></div>}
            </div></section>}

            {workflowStep === 3 && <section className="step-panel" aria-labelledby="direction-step-title"><div className="step-panel-heading"><p className="label">Step 03 · Campaign preferences</p><h3 id="direction-step-title">Where should this idea show up?</h3><p>Choose a channel and a voice. You can adjust the generated copy later.</p></div>
              <label className="campaign-objective-control">Campaign objective<select value={campaignObjective} onChange={(event) => { setCampaignObjective(event.target.value); setCampaign(null) }}>{campaignObjectives.map((item) => <option key={item}>{item}</option>)}</select><small>The campaign and image will follow this goal. LocalLift will not invent offers or contact details.</small></label>
              <fieldset className="control-group"><legend>Social channel</legend><div className="platform-options">{platforms.map((item) => <button type="button" className={`platform-option ${platform === item.id ? 'active' : ''}`} style={{ '--platform-color': item.accent }} key={item.id} onClick={() => { setPlatform(item.id); setCampaign(null) }} aria-pressed={platform === item.id}><span className="platform-symbol">{item.id === 'instagram' ? '◎' : item.id === 'facebook' ? 'f' : 'in'}</span><span><b>{item.label}</b><small>{item.id === 'instagram' ? 'Visual storytelling' : item.id === 'facebook' ? 'Local community' : 'Professional updates'}</small></span><span className="option-check">✓</span></button>)}</div></fieldset>
              <fieldset className="control-group"><legend>Brand voice</legend><div className="tone-options">{tones.map((item, index) => <label className={tone === item ? 'active' : ''} key={item}><input type="radio" name="tone" value={item} checked={tone === item} onChange={() => { setTone(item); setCampaign(null) }} /><span className="tone-icon">{['“ ”', '✦', 'Aa'][index]}</span><span><b>{item}</b><small>{['Warm, welcoming, and personal', 'Light-hearted and bright', 'Clear, polished, and direct'][index]}</small></span></label>)}</div></fieldset>
            </section>}

            {workflowStep === 4 && <section className="step-panel" aria-labelledby="create-step-title"><div className="step-panel-heading"><p className="label">Step 04 · Generate campaign</p><h3 id="create-step-title">A final look at your brief.</h3><p>LocalLift uses these details to create an editable campaign draft.</p></div><div className="brief-summary"><div><span>Business</span><b>{selectedBusinessForCampaign?.name || 'Add a business name'}</b><small>{selectedBusinessForCampaign?.category || 'Business type not added'}{selectedBusinessForCampaign?.address ? ` · ${selectedBusinessForCampaign.address}` : ''}</small></div><div><span>What you offer</span><p>{ownerBusinessDescription || 'Add products or services in step 1.'}</p>{businessDescriptionSource === 'pdf-summary' && <small className="description-verification-note">AI-written from the supplied PDF · unverified; check before use.</small>}{ownerBusinessOffer && <small>Offer: {ownerBusinessOffer}</small>}</div><div className="summary-inline"><div><span>Objective</span><b>{campaignObjective}</b></div><div><span>Social channel</span><b>{activePlatform?.label}</b></div><div><span>Voice</span><b>{tone}</b></div><div><span>Customer feedback</span><b>{selectedReviews.length ? `${selectedReviews.length} ${isAiDemoMode ? 'fictional examples' : 'provided review(s)'}` : 'Not included'}</b></div></div></div>{busy === 'generate' ? <div className="generation-state" role="status"><span className="generation-orbit"><i /><i /><i /></span><span><b>Crafting your campaign</b><small>Writing caption options, strategy, and creative direction…</small></span></div> : <><div className="provider-readiness"><span className="readiness-dot" /><span><b>Generation is ready</b><small>{aiProviderStatus}</small></span></div><p className="workflow-disclosure">AI-generated copy and images are drafts. Review every claim and offer before publishing.</p></>}</section>}

            <div className="workflow-nav-actions">{workflowStep > 1 && <button type="button" className="back-button" onClick={() => { setError(''); setWorkflowStep((current) => Math.max(1, current - 1)) }}>Back</button>}{workflowStep < 4 ? <button type="button" className="continue-button" onClick={continueWorkflow}>Continue <ArrowIcon /></button> : <button type="button" className="generate-button" onClick={generateCampaign} disabled={busy === 'generate' || !selectedBusinessForCampaign || !ownerBusinessDescription.trim() || (selectedReviews.length > 0 && !isAiDemoMode && !permissionConfirmed)}><SparkleIcon />{busy === 'generate' ? 'Creating your campaign…' : 'Create campaign'}<ArrowIcon /></button>}</div>
          </div>
        </div>
      </section>

      {(notice || error) && <div className={`status-toast ${error ? 'error' : ''}`} role="status">{error || notice}<button onClick={() => { setNotice(''); setError('') }} aria-label="Dismiss message">×</button></div>}

      <section className="result-section" id="campaign-result" aria-live="polite">
        <div className="result-heading"><div><p className="eyebrow"><SparkleIcon /> Campaign preview</p><h2>{campaign ? (campaign.review_mode === 'ai_demo' ? 'Your draft, with fictional examples clearly marked.' : campaign.source_reviews?.some((review) => review.source_type === 'pdf_unverified') ? 'Drafted with unnamed, unverified PDF snippets.' : campaign.review_highlight ? 'Built from your brief and feedback.' : 'Built from your business brief.') : 'Your campaign draft will appear here.'}</h2><p>Copy, adjust, and review each detail before publishing.</p>{campaignBusiness.source_label && <p className="source-attribution">Listing source: {campaignBusiness.source_label}</p>}{campaignBusiness.description_source_type === 'pdf-summary' && <p className="source-attribution">The business description was AI-written from unnamed, uncited excerpts in the supplied PDF and is unverified.</p>}{campaignBusiness.description_source_type === 'owner-listing' && <p className="source-attribution">Business description: supplied by the owner-submitted listing.</p>}{campaign?.source_reviews?.some((review) => review.source_type === 'pdf_unverified') && <p className="source-attribution">Review text came from the supplied PDF; reviewer names and original sources were not provided. These excerpts are unverified.</p>}</div>{campaign && <span className="mode-badge">{campaign.review_mode === 'ai_demo' ? 'Fictional examples' : aiProviderLabel(campaign.mode)}</span>}</div>
        {!campaign ? <div className="campaign-empty"><div className="ghost-poster"><span>✦</span><span className="ghost-line wide" /><span className="ghost-line" /><span className="ghost-button" /></div><div><h3>Caption, hashtags, and artwork in one place.</h3><p>Your campaign preview appears after you create a draft. If you have no customer reviews to use, the campaign is generated from your business brief alone.</p></div></div> : <div className="campaign-grid">
          <article className="poster-card" style={{ '--poster-accent': activePlatform.accent }}>
            {campaign.review_mode === 'ai_demo' && <span className="demo-watermark">AI-WRITTEN · FICTIONAL</span>}
            {campaign.image_url ? <img src={campaign.image_url} alt={`Campaign artwork for ${campaignBusiness.name}`} /> : <div className="poster-fallback"><span className="poster-sun" /><p>{campaignBusiness.name}</p><h3>{campaign.poster_headline}</h3><small>{campaign.poster_subhead}</small><span className="poster-tag">{activePlatform.label}</span></div>}
            <div className="poster-footer"><span>{campaign.image_url ? campaign.image_source || campaign.campaign_strategy?.image_source || 'Campaign artwork' : 'Layout preview'}</span><div className="poster-actions"><button onClick={generateCampaignImage} disabled={busy === 'image' || !imageProviderConfigured}><SparkleIcon /> {busy === 'image' ? 'Generating image…' : campaign.image_url ? 'Regenerate AI image' : imageProviderConfigured ? 'Generate AI image' : 'AI image not connected'}</button><button onClick={() => copyText(campaign.image_prompt, 'Image prompt')}><CopyIcon /> Copy prompt</button><button onClick={() => imageFileRef.current?.click()} disabled={busy === 'image'}><ArrowIcon /> Upload image</button></div><p className="image-provider-note">Cloudflare Workers AI (FLUX.1 schnell) receives the business-based image prompt; review text is not sent for image generation. The Free plan has a shared daily limit of 10,000 AI neurons. {imageProviderStatus}</p><input ref={imageFileRef} className="image-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={attachCampaignImage} aria-label="Upload campaign image" /></div>
          </article>
          <article className="copy-card"><div className="copy-card-head"><div><p className="label">{activePlatform.label} caption</p><h3>{campaign.title}</h3></div><button className="icon-button" onClick={() => copyText(campaign.caption, 'Caption')} title="Copy caption" aria-label="Copy caption"><CopyIcon /></button></div>
            {campaign.campaign_strategy?.objective && <section className="campaign-strategy-panel" aria-label="Campaign strategy"><p className="label">Campaign strategy</p><h4>{campaign.campaign_strategy.objective}</h4><p>{campaign.campaign_strategy.core_message}</p><div className="strategy-details"><div><span>Suggested audience</span><b>{campaign.campaign_strategy.target_audience}</b></div><div><span>Call to action</span><b>{campaign.campaign_strategy.call_to_action}</b></div></div>{campaign.campaign_strategy.review_insights?.length > 0 && <div className="review-insights"><p className="label">Review themes · based on supplied text</p>{campaign.campaign_strategy.review_insights.map((insight, insightIndex) => <article key={`${insight.theme}-${insightIndex}`}><b>{insight.theme}</b><small>Supported by {insight.evidence_count} supplied review{insight.evidence_count === 1 ? '' : 's'}</small>{insight.evidence.map((item) => <blockquote key={`${item.review_id}-${item.quote}`}>“{item.quote}”<span>{item.source_type === 'pdf_unverified' ? 'Supplied PDF · unnamed · unverified' : 'Review supplied for this campaign'}</span></blockquote>)}</article>)}</div>}<small className="review-analysis-note">{campaign.campaign_strategy.review_analysis_note}</small></section>}
            <p className="caption-text">{campaign.caption}</p>{campaign.review_highlight && <div className="highlight-box"><p className="label">{campaign.review_mode === 'ai_demo' ? 'Fictional AI-generated example' : 'Customer feedback supplied for this campaign'}</p><p>“{campaign.review_highlight}”</p></div>}<div className="hashtag-block"><p className="label">Hashtags</p><p>{campaign.hashtags.join(' ')}</p><button className="secondary-button copy-hashtags-button" onClick={() => copyText(campaign.hashtags.join(' '), 'Hashtags')}><CopyIcon /> Copy hashtags</button></div><button className="secondary-button" onClick={() => copyText([campaign.caption, campaign.campaign_strategy?.call_to_action, campaign.hashtags.join(' ')].filter(Boolean).join('\n\n'), 'Campaign copy and call to action')}><CopyIcon /> Copy campaign copy</button></article>
        </div>}
      </section>
      {campaign?.source_reviews?.some((review) => review.source_type === 'pdf_unverified') && <details className="review-source-details"><summary>View the unnamed review snippets included with this campaign</summary><p>Source: your supplied PDF. These snippets have no named reviewers or cited original source and are not independently verified.</p><div>{campaign.source_reviews.filter((review) => review.source_type === 'pdf_unverified').map((review) => <article key={review.id}><b>PDF rating shown: {review.rating}/5 · unnamed</b><span>{review.text}</span></article>)}</div></details>}

      <section className="history-section" id="history">
        <div className="history-heading">
          <div><p className="eyebrow">{user ? 'Saved to your account' : 'Saved in this browser'}</p><h2>Your recent campaigns</h2></div>
          {history.length > 0 && <button className="text-button" onClick={clearHistory} disabled={busy === 'history'}>{busy === 'history' ? 'Loading…' : 'Clear history'}</button>}
        </div>
        {history.length ? <div className="history-list">{history.map((item, index) => <button className="history-card" key={item.id || item.local_id || `${item.title}-${index}`} onClick={() => openHistoryCampaign(item)}><span className="history-thumb">{item.image_url ? <img src={item.image_url} alt="" /> : <span>✦</span>}</span><span><b>{item.business?.name || item.title}</b><small>{item.title} · {item.platform || 'social'} · {new Date(item.saved_at).toLocaleDateString()}</small>{item.business?.source_label && <small className="history-disclosure">{item.business.source_label}</small>}{item.review_mode === 'ai_demo' && <small className="history-disclosure">Contains fictional AI-written examples</small>}</span><ArrowIcon /></button>)}</div> : <div className="history-empty"><span>✦</span><div><b>Your campaign history will appear here.</b><p>Create a draft to keep it in this browser, or sign in to save it to your account.</p></div></div>}
      </section>

      <footer><span><LeafMark /> LocalLift AI</span><p>Thoughtful marketing for local business · Human review required before publishing.</p></footer>

      {authOpen && <div className="auth-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false) }}>
        <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <button className="auth-close" onClick={() => setAuthOpen(false)} aria-label="Close sign-in window">×</button>
          <p className="eyebrow"><SparkleIcon /> LocalLift account</p>
          {!supabase ? <>
            <h2 id="auth-title">Connect account storage</h2>
            <p className="auth-copy">Supabase is not configured yet. Create a Supabase project, run <code>supabase/schema.sql</code>, then add the project URL and publishable key to <code>frontend/.env.local</code>. Until then, campaigns stay in this browser.</p>
          </> : <>
            <h2 id="auth-title">{authMode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
            <p className="auth-copy">Sign in to save campaign ideas to your account and use them on another device.</p>
            <form className="auth-form" onSubmit={submitAuth}>
              <label>Email<input type="email" autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} required /></label>
              <label>Password<input type="password" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} minLength={6} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} required /></label>
              {authError && <p className="auth-error" role="alert">{authError}</p>}
              {authMessage && <p className="auth-message" role="status">{authMessage}</p>}
              <button className="generate-button" type="submit" disabled={authBusy}>{authBusy ? 'Please wait…' : authMode === 'signup' ? 'Create account' : 'Sign in'}</button>
            </form>
            <button className="auth-switch" onClick={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setAuthError(''); setAuthMessage('') }}>
              {authMode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}
            </button>
          </>}
        </section>
      </div>}
    </main>
  )
}
