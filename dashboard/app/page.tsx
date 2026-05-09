import { getStats } from '@/lib/db';
import { StatCard } from '@/components/StatCard';
import { QuickActions } from '@/components/QuickActions';

export default async function DashboardPage() {
  const stats = await getStats();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">
          Last updated: {new Date().toLocaleDateString('id-ID')}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Alumni"
          value={stats.totalAlumni}
          icon="users"
          trend={+12}
        />
        <StatCard
          title="Angkatan Terdata"
          value={stats.totalAngkatan}
          icon="calendar"
        />
        <StatCard
          title="Perusahaan"
          value={stats.totalCompanies}
          icon="building"
        />
        <StatCard
          title="Tech Stacks"
          value={stats.totalTechStacks}
          icon="code"
        />
      </div>

      {/* Quick Actions */}
      <QuickActions />

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
        <div className="space-y-3">
          <p className="text-gray-500">
            Scraper status: <span className="text-green-600 font-medium">Ready</span>
          </p>
          <p className="text-gray-500">
            Last scrape: <span className="text-gray-700">Never</span>
          </p>
          <p className="text-gray-500">
            Database: <span className="text-green-600 font-medium">Connected</span>
          </p>
        </div>
      </div>
    </div>
  );
}
