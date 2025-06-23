import React, { useState, useEffect } from 'react';
import { 
  ArrowRight, 
  Shield, 
  Zap, 
  Code, 
  Users, 
  CreditCard, 
  Globe,
  CheckCircle,
  Star,
  Github,
  Menu,
  X,
  Play,
  ChevronDown,
  Database,
  Server,
  Smartphone,
  Palette,
  MessageSquare,
  Award,
  TrendingUp,
  Clock,
  DollarSign,
  LogIn,
  UserPlus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePlans } from '../hooks/usePlans';
import { AuthModal } from '../components/AuthModal';
import { DemoModeIndicator } from '../components/DemoModeIndicator';

const LandingPage = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('features');
  const [scrollY, setScrollY] = useState(0);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  const { user, loading: authLoading, isDemoMode } = useAuth();
  const { plans, loading: plansLoading } = usePlans();
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const openAuthModal = (mode: 'signin' | 'signup') => {
    // In demo mode, don't show auth modal since auth is bypassed
    if (isDemoMode) {
      console.log('🎭 Demo mode: Auth modal bypassed');
      return;
    }
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const handleDashboardClick = () => {
    if (user?.role === 'ADMIN') {
      navigate('/admin');
    } else {
      navigate('/client');
    }
  };

  const features = [
    {
      icon: Zap,
      title: "Supabase + TypeScript",
      description: "End-to-end type safety with PostgreSQL, real-time subscriptions, and auto-generated types.",
      color: "from-purple-500 to-pink-500"
    },
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "Row-level security, JWT authentication, audit trails, and comprehensive security features out of the box.",
      color: "from-blue-500 to-cyan-500"
    },
    {
      icon: CreditCard,
      title: "Multi-Gateway Billing",
      description: "Stripe, PayPal, and custom payment processors with unified API and webhook handling.",
      color: "from-green-500 to-emerald-500"
    },
    {
      icon: Code,
      title: "Plugin Ecosystem",
      description: "Extensible architecture with plugin hooks, marketplace, and SDK for custom integrations.",
      color: "from-orange-500 to-red-500"
    },
    {
      icon: Globe,
      title: "Global Ready",
      description: "i18n support, RTL languages, multiple currencies, and comprehensive localization features.",
      color: "from-indigo-500 to-purple-500"
    },
    {
      icon: Users,
      title: "Modern UI",
      description: "React-based admin panel with customizable themes, responsive design, and excellent UX.",
      color: "from-pink-500 to-rose-500"
    }
  ];

  const techStack = [
    { name: "PostgreSQL + Supabase", description: "Real-time database with auto-generated APIs", icon: Database, color: "from-blue-500 to-cyan-500" },
    { name: "React + Vite", description: "Modern SPA with hot reload and TypeScript", icon: Smartphone, color: "from-green-500 to-emerald-500" },
    { name: "TypeScript", description: "Type-safe development with excellent DX", icon: Code, color: "from-orange-500 to-red-500" },
    { name: "Tailwind CSS", description: "Utility-first CSS framework for rapid UI development", icon: Palette, color: "from-purple-500 to-pink-500" }
  ];

  const testimonials = [
    {
      name: "Sarah Chen",
      role: "CTO at CloudHost Pro",
      avatar: "https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop&crop=face",
      content: "Panel1 transformed our billing infrastructure. The type safety and plugin system saved us months of development time.",
      rating: 5
    },
    {
      name: "Marcus Rodriguez",
      role: "Founder at DevOps Solutions",
      avatar: "https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop&crop=face",
      content: "Finally, a billing platform built for developers. The API-first approach and documentation are outstanding.",
      rating: 5
    },
    {
      name: "Emily Watson",
      role: "Lead Developer at SaaS Startup",
      avatar: "https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop&crop=face",
      content: "The plugin ecosystem and extensibility make Panel1 perfect for our custom requirements. Highly recommended!",
      rating: 5
    }
  ];

  const stats = [
    { number: "10K+", label: "Developers", icon: Users },
    { number: "500+", label: "Companies", icon: Award },
    { number: "99.9%", label: "Uptime", icon: TrendingUp },
    { number: "24/7", label: "Support", icon: Clock }
  ];

  // Convert database plans to display format
  const pricingPlans = [
    {
      name: "Open Source",
      price: "Free",
      description: "Perfect for developers and small projects",
      features: [
        "Full source code access",
        "Community support",
        "Basic plugins",
        "Self-hosted deployment",
        "Up to 100 customers"
      ],
      popular: false,
      cta: "Get Started"
    },
    ...plans.filter(plan => plan.interval === 'MONTHLY').map(plan => ({
      name: plan.name,
      price: `$${plan.price}`,
      period: "/month",
      description: plan.description || "Professional hosting solution",
      features: plan.features ? Object.values(plan.features) as string[] : [],
      popular: plan.name.toLowerCase().includes('professional'),
      cta: user ? "Subscribe" : "Sign Up to Subscribe"
    })),
    {
      name: "Enterprise",
      price: "Custom",
      description: "For large organizations",
      features: [
        "Everything in Professional",
        "Dedicated support",
        "Custom development",
        "SLA guarantees",
        "Unlimited customers",
        "White-label options"
      ],
      popular: false,
      cta: "Contact Sales"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Demo Mode Indicator */}
      <DemoModeIndicator />

      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-40 px-6 py-4 transition-all duration-300 ${
        scrollY > 50 ? 'bg-slate-900/95 backdrop-blur-md border-b border-gray-800' : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-purple-400 to-pink-400 rounded-lg flex items-center justify-center">
              <Code className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">Panel1</span>
            {isDemoMode && (
              <span className="bg-orange-500/20 text-orange-300 text-xs px-2 py-1 rounded-full border border-orange-500/30">
                DEMO
              </span>
            )}
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <a href="#features" className="text-gray-300 hover:text-white transition-colors">Features</a>
            <a href="#architecture" className="text-gray-300 hover:text-white transition-colors">Architecture</a>
            <a href="#pricing" className="text-gray-300 hover:text-white transition-colors">Pricing</a>
            <a href="#testimonials" className="text-gray-300 hover:text-white transition-colors">Reviews</a>
            <a href="#docs" className="text-gray-300 hover:text-white transition-colors">Docs</a>
            
            {user ? (
              <div className="flex items-center space-x-4">
                <span className="text-gray-300">Welcome, {user.first_name || user.email}</span>
                <button 
                  onClick={handleDashboardClick}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 transform hover:scale-105"
                >
                  Dashboard
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <button 
                  onClick={() => openAuthModal('signin')}
                  className="text-gray-300 hover:text-white transition-colors flex items-center space-x-1"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </button>
                <button 
                  onClick={() => openAuthModal('signup')}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 transform hover:scale-105 flex items-center space-x-1"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Get Started</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button 
            className="md:hidden text-white"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-slate-900/95 backdrop-blur-md border-b border-gray-800 px-6 py-4">
            <div className="flex flex-col space-y-4">
              <a href="#features" className="text-gray-300 hover:text-white transition-colors">Features</a>
              <a href="#architecture" className="text-gray-300 hover:text-white transition-colors">Architecture</a>
              <a href="#pricing" className="text-gray-300 hover:text-white transition-colors">Pricing</a>
              <a href="#testimonials" className="text-gray-300 hover:text-white transition-colors">Reviews</a>
              <a href="#docs" className="text-gray-300 hover:text-white transition-colors">Docs</a>
              
              {user ? (
                <div className="pt-4 border-t border-gray-700">
                  <p className="text-gray-300 mb-2">Welcome, {user.first_name || user.email}</p>
                  <button 
                    onClick={handleDashboardClick}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 w-full"
                  >
                    Dashboard
                  </button>
                </div>
              ) : (
                <div className="pt-4 border-t border-gray-700 space-y-2">
                  <button 
                    onClick={() => openAuthModal('signin')}
                    className="border border-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-800 transition-all duration-200 w-full flex items-center justify-center space-x-1"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Sign In</span>
                  </button>
                  <button 
                    onClick={() => openAuthModal('signup')}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 w-full flex items-center justify-center space-x-1"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Get Started</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative px-6 py-32 overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-pink-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>

        <div className="max-w-7xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center space-x-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-2 mb-8 animate-fade-in">
            <Star className="w-4 h-4 text-purple-400" />
            <span className="text-purple-300 text-sm">Open Source & Developer-First</span>
            {isDemoMode && (
              <>
                <span className="text-purple-300">•</span>
                <span className="text-orange-300 text-sm">Demo Mode Active</span>
              </>
            )}
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight animate-fade-in-up">
            The <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Developer-First</span>
            <br />
            Billing Platform
          </h1>
          
          <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto leading-relaxed animate-fade-in-up delay-200">
            Modern, type-safe, and extensible billing & provisioning platform built for hosting providers, 
            SaaS companies, and developers who demand better than legacy solutions.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4 mb-12 animate-fade-in-up delay-300">
            <button 
              onClick={() => user ? handleDashboardClick() : openAuthModal('signup')}
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-8 py-4 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 transform hover:scale-105 flex items-center space-x-2 text-lg font-semibold group"
            >
              <span>{user ? 'Go to Dashboard' : (isDemoMode ? 'Explore Demo' : 'Start Building')}</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button className="border border-gray-600 text-white px-8 py-4 rounded-lg hover:bg-gray-800 transition-all duration-200 flex items-center space-x-2 text-lg group">
              <Play className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span>Watch Demo</span>
            </button>
            <button className="border border-gray-600 text-white px-8 py-4 rounded-lg hover:bg-gray-800 transition-all duration-200 flex items-center space-x-2 text-lg group">
              <Github className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span>View on GitHub</span>
            </button>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto animate-fade-in-up delay-400">
            {stats.map((stat, index) => (
              <div key={index} className="text-center group">
                <div className="flex items-center justify-center mb-2">
                  <stat.icon className="w-6 h-6 text-purple-400 mr-2 group-hover:scale-110 transition-transform" />
                  <div className="text-3xl font-bold text-white">{stat.number}</div>
                </div>
                <div className="text-gray-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative px-6 py-20 bg-black/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Built for Modern Development</h2>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              Everything you need to build, scale, and manage your billing infrastructure with confidence.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 hover:border-purple-500/50 transition-all duration-300 group hover:transform hover:scale-105">
                <div className={`w-12 h-12 bg-gradient-to-r ${feature.color} rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200`}>
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
                <p className="text-gray-300">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture Section */}
      <section id="architecture" className="relative px-6 py-20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Modern Architecture</h2>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              Built with the latest technologies and best practices for scalability and maintainability.
            </p>
          </div>
          
          <div className="bg-gradient-to-br from-gray-800/30 to-gray-900/30 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {techStack.map((tech, index) => (
                <div key={index} className="text-center group">
                  <div className={`w-16 h-16 bg-gradient-to-r ${tech.color} rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200`}>
                    <tech.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{tech.name}</h3>
                  <p className="text-gray-400 text-sm">{tech.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="relative px-6 py-20 bg-black/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Loved by Developers</h2>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              See what developers and companies are saying about Panel1.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 hover:border-purple-500/50 transition-all duration-300">
                <div className="flex items-center mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                  ))}
                </div>
                <p className="text-gray-300 mb-6 italic">"{testimonial.content}"</p>
                <div className="flex items-center">
                  <img 
                    src={testimonial.avatar} 
                    alt={testimonial.name}
                    className="w-12 h-12 rounded-full mr-4"
                  />
                  <div>
                    <div className="text-white font-semibold">{testimonial.name}</div>
                    <div className="text-gray-400 text-sm">{testimonial.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="relative px-6 py-20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Simple, Transparent Pricing</h2>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              Choose the plan that fits your needs. Start free and scale as you grow.
            </p>
          </div>
          
          {plansLoading ? (
            <div className="text-center text-gray-400">Loading pricing plans...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {pricingPlans.map((plan, index) => (
                <div key={index} className={`relative bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-sm border rounded-xl p-8 transition-all duration-300 hover:transform hover:scale-105 ${
                  plan.popular 
                    ? 'border-purple-500/50 ring-2 ring-purple-500/20' 
                    : 'border-gray-700/50 hover:border-purple-500/50'
                }`}>
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                      <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                        Most Popular
                      </span>
                    </div>
                  )}
                  
                  <div className="text-center mb-8">
                    <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                    <div className="mb-4">
                      <span className="text-4xl font-bold text-white">{plan.price}</span>
                      {plan.period && <span className="text-gray-400">{plan.period}</span>}
                    </div>
                    <p className="text-gray-300">{plan.description}</p>
                  </div>
                  
                  <ul className="space-y-4 mb-8">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center text-gray-300">
                        <CheckCircle className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  
                  <button 
                    onClick={() => {
                      if (plan.cta.includes('Sign Up')) {
                        openAuthModal('signup');
                      } else if (user) {
                        handleDashboardClick();
                      }
                    }}
                    className={`w-full py-3 rounded-lg font-semibold transition-all duration-200 ${
                      plan.popular
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 transform hover:scale-105'
                        : 'border border-gray-600 text-white hover:bg-gray-800'
                    }`}
                  >
                    {plan.cta}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative px-6 py-20 bg-gradient-to-r from-purple-900/50 to-pink-900/50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-6">Ready to Build the Future?</h2>
          <p className="text-xl text-gray-300 mb-8">
            Join thousands of developers building the next generation of billing platforms with Panel1.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
            <button 
              onClick={() => user ? handleDashboardClick() : openAuthModal('signup')}
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-8 py-4 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 transform hover:scale-105 flex items-center space-x-2 text-lg font-semibold group"
            >
              <span>{user ? 'Go to Dashboard' : (isDemoMode ? 'Explore Demo Features' : 'Get Started Now')}</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button className="border border-gray-600 text-white px-8 py-4 rounded-lg hover:bg-gray-800 transition-all duration-200 flex items-center space-x-2 text-lg group">
              <Github className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span>Star on GitHub</span>
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative px-6 py-12 border-t border-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-r from-purple-400 to-pink-400 rounded-lg flex items-center justify-center">
                  <Code className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-white">Panel1</span>
                {isDemoMode && (
                  <span className="bg-orange-500/20 text-orange-300 text-xs px-2 py-1 rounded-full border border-orange-500/30">
                    DEMO
                  </span>
                )}
              </div>
              <p className="text-gray-400 mb-4 max-w-md">
                The developer-first billing platform that scales with your business. 
                Open source, type-safe, and built for the modern web.
              </p>
              <div className="flex items-center space-x-4">
                <a href="#" className="text-gray-400 hover:text-white transition-colors">
                  <Github className="w-5 h-5" />
                </a>
                <a href="#" className="text-gray-400 hover:text-white transition-colors">
                  <MessageSquare className="w-5 h-5" />
                </a>
              </div>
            </div>
            
            <div>
              <h3 className="text-white font-semibold mb-4">Product</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Documentation</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">API Reference</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-white font-semibold mb-4">Company</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
          </div>
          
          <div className="pt-8 border-t border-gray-800 flex flex-col md:flex-row items-center justify-between">
            <p className="text-gray-400 mb-4 md:mb-0">
              &copy; 2024 Panel1. Built with ❤️ by developers, for developers.
            </p>
            <div className="flex items-center space-x-6">
              <a href="#" className="text-gray-400 hover:text-white transition-colors text-sm">Privacy Policy</a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors text-sm">Terms of Service</a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors text-sm">Cookie Policy</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={authModalOpen} 
        onClose={() => setAuthModalOpen(false)} 
        initialMode={authMode}
      />
    </div>
  );
};

export default LandingPage;