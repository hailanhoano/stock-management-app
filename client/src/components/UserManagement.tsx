import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  PlusIcon, 
  TrashIcon, 
  UserIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resettingPassword, setResettingPassword] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [newUser, setNewUser] = useState({
    email: '',
    name: '',
    password: '',
    role: 'user'
  });

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      fetchUsers();
    }
  }, [currentUser]);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        setError('Failed to fetch users');
      }
    } catch (error) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(newUser),
      });

      const data = await response.json();

      if (response.ok) {
        setUsers([...users, data.user]);
        setNewUser({ email: '', name: '', password: '', role: 'user' });
        setShowAddForm(false);
      } else {
        setError(data.message || 'Failed to create user');
      }
    } catch (error) {
      setError('Network error');
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3001/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editingUser.name,
          email: editingUser.email,
          role: editingUser.role
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setUsers(users.map(user => 
          user.id === editingUser.id ? editingUser : user
        ));
        
        // If updating self, refresh the current user's session
        if (data.isSelfUpdate) {
          // Update the stored user data
          const currentUserData = JSON.parse(localStorage.getItem('user') || '{}');
          const updatedUserData = { ...currentUserData, ...editingUser };
          localStorage.setItem('user', JSON.stringify(updatedUserData));
          
          // Show success message
          alert('Your account has been updated successfully!');
        }
        
        setEditingUser(null);
      } else {
        setError(data.message || 'Failed to update user');
      }
    } catch (error) {
      setError('Network error');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingPassword || !newPassword) return;
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3001/api/users/${resettingPassword}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ password: newPassword }),
      });

      const data = await response.json();

      if (response.ok) {
        setResettingPassword(null);
        setNewPassword('');
        
        // If resetting own password, show special message
        if (resettingPassword === currentUser?.id) {
          alert('Your password has been reset successfully!');
        }
      } else {
        setError(data.message || 'Failed to reset password');
      }
    } catch (error) {
      setError('Network error');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3001/api/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setUsers(users.filter(user => user.id !== userId));
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to delete user');
      }
    } catch (error) {
      setError('Network error');
    }
  };

  if (currentUser?.role !== 'admin') {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
        <div className="flex">
          <ShieldCheckIcon className="h-5 w-5 text-yellow-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">Admin Access Required</h3>
            <div className="mt-2 text-sm text-yellow-700">
              Only administrators can manage users.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">User Management</h3>
          <p className="text-sm text-gray-500">Manage system users and permissions</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Add User
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-6">
          <h4 className="text-md font-medium text-gray-900 mb-4">Add New User</h4>
          <form onSubmit={handleAddUser} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  required
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  required
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <input
                  type="password"
                  required
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Add User
              </button>
            </div>
          </form>
                 </div>
       )}

       {editingUser && (
         <div className="bg-gray-50 border border-gray-200 rounded-md p-6">
           <h4 className="text-md font-medium text-gray-900 mb-4">
             {editingUser.id === currentUser?.id ? 'Edit Your Account' : 'Edit User'}
           </h4>
           {editingUser.id === currentUser?.id && (
             <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
               <p className="text-sm text-blue-800">
                 You are editing your own account. Changes will affect your current session.
               </p>
             </div>
           )}
           <form onSubmit={handleEditUser} className="space-y-4">
             <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
               <div>
                 <label className="block text-sm font-medium text-gray-700">Name</label>
                 <input
                   type="text"
                   required
                   value={editingUser.name}
                   onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                   className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                 />
               </div>
               <div>
                 <label className="block text-sm font-medium text-gray-700">Email</label>
                 <input
                   type="email"
                   required
                   value={editingUser.email}
                   onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                   className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                 />
               </div>
               <div>
                 <label className="block text-sm font-medium text-gray-700">Role</label>
                 <select
                   value={editingUser.role}
                   onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                   className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                 >
                   <option value="user">User</option>
                   <option value="admin">Admin</option>
                 </select>
               </div>
             </div>
             <div className="flex justify-end space-x-3">
               <button
                 type="button"
                 onClick={() => setEditingUser(null)}
                 className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
               >
                 Cancel
               </button>
               <button
                 type="submit"
                 className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
               >
                 Update User
               </button>
             </div>
           </form>
         </div>
       )}

       {resettingPassword && (
         <div className="bg-gray-50 border border-gray-200 rounded-md p-6">
           <h4 className="text-md font-medium text-gray-900 mb-4">
             {resettingPassword === currentUser?.id ? 'Reset Your Password' : 'Reset Password'}
           </h4>
           {resettingPassword === currentUser?.id && (
             <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
               <p className="text-sm text-yellow-800">
                 You are resetting your own password. You will need to log in again after this change.
               </p>
             </div>
           )}
           <form onSubmit={handleResetPassword} className="space-y-4">
             <div>
               <label className="block text-sm font-medium text-gray-700">New Password</label>
               <input
                 type="password"
                 required
                 value={newPassword}
                 onChange={(e) => setNewPassword(e.target.value)}
                 className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                 placeholder="Enter new password"
               />
             </div>
             <div className="flex justify-end space-x-3">
               <button
                 type="button"
                 onClick={() => {
                   setResettingPassword(null);
                   setNewPassword('');
                 }}
                 className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
               >
                 Cancel
               </button>
               <button
                 type="submit"
                 className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
               >
                 Reset Password
               </button>
             </div>
           </form>
         </div>
       )}

       <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {users.map((user) => (
            <li key={user.id} className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    {user.role === 'admin' ? (
                      <ShieldCheckIcon className="h-6 w-6 text-red-500" />
                    ) : (
                      <UserIcon className="h-6 w-6 text-gray-400" />
                    )}
                  </div>
                                   <div className="ml-4">
                   <div className="text-sm font-medium text-gray-900 flex items-center">
                     {user.name}
                     {user.id === currentUser?.id && (
                       <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                         You
                       </span>
                     )}
                   </div>
                   <div className="text-sm text-gray-500">{user.email}</div>
                 </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    user.role === 'admin' 
                      ? 'bg-red-100 text-red-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {user.role}
                  </span>
                                     <div className="flex items-center space-x-2">
                     <button
                       onClick={() => setEditingUser(user)}
                       className="text-blue-600 hover:text-blue-900"
                       title="Edit user"
                     >
                       <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                       </svg>
                     </button>
                     <button
                       onClick={() => setResettingPassword(user.id)}
                       className="text-green-600 hover:text-green-900"
                       title="Reset password"
                     >
                       <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                       </svg>
                     </button>
                     {user.id !== currentUser?.id && (
                       <button
                         onClick={() => handleDeleteUser(user.id)}
                         className="text-red-600 hover:text-red-900"
                         title="Delete user"
                       >
                         <TrashIcon className="h-5 w-5" />
                       </button>
                     )}
                   </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default UserManagement; 