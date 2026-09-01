import type { Transaction, AnalysisResult, FinancialProfile } from './types/finance'
import { useState, useEffect } from 'react'
import { parseFile } from './parsers/fileReader'
import { analyzeTransactions } from './parsers/analyzer'
import UploadPage from './pages/UploadPage'
import DashboardPage from './pages/DashboardPage'

export interface UploadedFile {
  id: string
  name: string
  bank: string
  transactionCount: number
}

type AppView = 'upload' | 'processing' | 'dashboard'

const defaultProfile: FinancialProfile = {
  monthlyIncome: 0,
  spendingLimit: 0,
  savingsGoal: 0,
}

export default function App() {
  const [view, setView] = useState<AppView>('upload')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [statusMessage, setStatusMessage] = useState<string>('')
  
  const [profile, setProfile] = useState<FinancialProfile>(defaultProfile)

  useEffect(() => {
    const stored = localStorage.getItem('myFinanceProfile')
    if (stored) {
      try {
        setProfile(JSON.parse(stored))
      } catch (e) {
        console.error('Failed to parse profile')
      }
    }
  }, [])

  const handleUpdateProfile = (newProfile: FinancialProfile) => {
    setProfile(newProfile)
    localStorage.setItem('myFinanceProfile', JSON.stringify(newProfile))
  }

  const handleFilesAnalyze = async (files: File[]) => {
    setView('processing')
    setStatusMessage('Dosyalar okunuyor...')

    const allTransactions: Transaction[] = [...transactions]
    const newFiles: UploadedFile[] = []

    for (const file of files) {
      try {
        setStatusMessage(`${file.name} okunuyor...`)
        const { bank, transactions: txs } = await parseFile(file, setStatusMessage)

        // Deduplicate using unique ID
        const existingIds = new Set(allTransactions.map(t => t.id))
        const uniqueTxs = txs.filter(t => t.id && !existingIds.has(t.id))
        
        allTransactions.push(...uniqueTxs)

        newFiles.push({
          id: `${Date.now()}-${Math.random()}`,
          name: file.name,
          bank,
          transactionCount: uniqueTxs.length,
        })
      } catch (err: any) {
        alert(`${file.name}: ${err.message}`)
      }
    }

    if (allTransactions.length === 0) {
      setView('upload')
      return
    }

    setStatusMessage('Analiz yapılıyor...')
    await new Promise(r => setTimeout(r, 200))

    const result = analyzeTransactions(allTransactions)
    setTransactions(allTransactions)
    setUploadedFiles(prev => [...prev, ...newFiles])
    setAnalysis(result)
    setView('dashboard')
    setStatusMessage('')
  }

  const handleAddManualTransaction = (t: Transaction) => {
    setTransactions(prev => {
      const updated = [...prev, t]
      setAnalysis(analyzeTransactions(updated))
      return updated
    })
  }

  const handleUpdateCategory = (rawLineOrKey: string, newCategory: string) => {
    setTransactions((prev) => {
      const updated = prev.map((t) => {
        const isMatch = (t.raw_line && t.raw_line === rawLineOrKey) ||
                        (`${t.date}_${t.description}` === rawLineOrKey)
        if (isMatch) {
          return { ...t, category: newCategory }
        }
        return t
      })
      const newAnalysis = analyzeTransactions(updated)
      setAnalysis(newAnalysis)
      return updated
    })
  }

  const handleReset = () => {
    setTransactions([])
    setAnalysis(null)
    setUploadedFiles([])
    setStatusMessage('')
    setView('upload')
  }

  const handleAddMore = () => {
    setView('upload')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      {view === 'upload' || view === 'processing' ? (
        <UploadPage
          isProcessing={view === 'processing'}
          statusMessage={statusMessage}
          uploadedFiles={uploadedFiles}
          onAnalyze={handleFilesAnalyze}
          onReset={handleReset}
          onBackToDashboard={() => setView('dashboard')}
        />
      ) : (
        analysis && (
          <DashboardPage
            transactions={transactions}
            analysis={analysis}
            uploadedFiles={uploadedFiles}
            profile={profile}
            onReset={handleReset}
            onAddMore={handleAddMore}
            onUpdateCategory={handleUpdateCategory}
            onUpdateProfile={handleUpdateProfile}
            onAddManualTransaction={handleAddManualTransaction}
          />
        )
      )}
    </div>
  )
}
