import { motion } from 'framer-motion';
import { ArrowRight, TrendingUp, Shield, Zap, Globe } from 'lucide-react';
import { useLocation } from 'wouter';
import { PremiumButton, PremiumCard, PremiumStat, PremiumDivider } from '@/components/MotionComponents';
import { ResponsiveContainer, ResponsiveGrid, ResponsiveButtonGroup } from '@/components/ResponsiveLayout';
import { useOrientation } from '@/hooks/useOrientation';

export default function ExchangeHome() {
  const [, setLocation] = useLocation();
  const { isPortrait, isLandscape } = useOrientation();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.2 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  const navigationLinks = {
    markets: () => setLocation('/markets'),
    trading: () => setLocation('/trading'),
    earn: () => setLocation('/earn'),
    wallet: () => setLocation('/wallet'),
    portfolio: () => setLocation('/portfolio-premium'),
    security: () => setLocation('/security'),
  };

  return (
    <div className="terminal-surface terminal-grid relative min-h-screen overflow-hidden">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          className="absolute left-10 top-20 size-72 rounded-full bg-gradient-to-r from-primary to-secondary opacity-20 blur-3xl"
          animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.3, 0.2] }}
          transition={{ duration: 4, repeat: Infinity }}
        />
        <motion.div 
          className="absolute bottom-20 right-10 size-72 rounded-full bg-gradient-to-r from-accent to-primary opacity-20 blur-3xl"
          animate={{ scale: [1.1, 1, 1.1], opacity: [0.2, 0.3, 0.2] }}
          transition={{ duration: 4, repeat: Infinity, delay: 2 }}
        />
      </div>

      {/* Hero Section */}
      <ResponsiveContainer portraitPadding="px-4 py-12" landscapePadding="px-8 py-16">
        <motion.section
          className="relative z-10"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div className={`text-center ${isPortrait ? 'mb-8' : 'mb-16'}`} variants={itemVariants}>
            <motion.h1 
              className={`${isPortrait ? 'text-4xl' : 'text-6xl md:text-7xl'} mb-4 font-bold leading-tight text-foreground`}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              Trade with
              <br />
              <motion.span 
                className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent"
                animate={{ backgroundPosition: ['0%', '100%', '0%'] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                precision
              </motion.span>
            </motion.h1>
            <motion.p 
              className={`${isPortrait ? 'text-base' : 'text-xl'} ${isPortrait ? 'max-w-full' : 'max-w-2xl'} mx-auto ${isPortrait ? 'mb-6' : 'mb-8'} text-foreground-secondary`}
              variants={itemVariants}
            >
              A focused execution environment for traders who value clarity, velocity, and disciplined risk control.
            </motion.p>
            <p className="mx-auto mb-6 max-w-2xl rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-6 text-foreground-secondary">
              Interface preview: market values, account information, execution, and verification services are not connected in this view. Review each workflow’s status before taking action.
            </p>
            <ResponsiveButtonGroup portraitStacked={true} gap={isPortrait ? '3' : '4'} className="justify-center">
              <PremiumButton 
                onClick={navigationLinks.trading}
                variant="primary"
                className={`${isPortrait ? 'w-full' : ''} flex items-center justify-center gap-2 rounded-xl px-8 py-4`}
              >
                Open trading workspace <ArrowRight size={20} />
              </PremiumButton>
              <PremiumButton 
                onClick={navigationLinks.markets}
                variant="outline"
                className={`${isPortrait ? 'w-full' : ''} rounded-xl px-8 py-4`}
              >
                Explore markets
              </PremiumButton>
            </ResponsiveButtonGroup>
          </motion.div>

          {/* Stats */}
          <ResponsiveGrid portraitCols={1} landscapeCols={3} gap={isPortrait ? '3' : '8'} className={isPortrait ? 'mb-8' : 'mb-24'}>
            {[
              { label: 'Workspace', value: 'Terminal' },
              { label: 'Market display', value: 'Reference' },
              { label: 'Execution mode', value: 'Preview' },
            ].map((stat, i) => (
              <motion.div key={i} variants={itemVariants}>
                <PremiumStat 
                  label={stat.label}
                  value={stat.value}
                />
              </motion.div>
            ))}
          </ResponsiveGrid>

          <PremiumDivider className={isPortrait ? 'my-8' : 'mb-24'} />

          {/* Features Grid */}
          <ResponsiveGrid 
            portraitCols={1} 
            landscapeCols={2} 
            gap={isPortrait ? '3' : '8'} 
            className={isPortrait ? 'mb-8' : 'mb-24'}
          >
            {[
              {
                icon: Zap,
                title: 'Focused workspace',
                description: 'Responsive surfaces for reviewing market context and preparing workflow inputs.',
              },
              {
                icon: Shield,
                title: 'Clear boundaries',
                description: 'Unavailable services are labeled instead of being simulated as live account controls.',
              },
              {
                icon: TrendingUp,
                title: 'Trading workflows',
                description: 'Spot and futures workspaces make preview state, risk guidance, and next steps visible.',
              },
              {
                icon: Globe,
                title: 'Connected navigation',
                description: 'Move between research, account, and workflow tools from one consistent terminal.',
              },
            ].map((feature, i) => {
              const Icon = feature.icon;
              return (
                <motion.div key={i} variants={itemVariants}>
                  <PremiumCard hoverEffect="lift" className={isPortrait ? 'p-6' : 'p-8'}>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                    >
                      <motion.div
                        className="mb-4 flex size-12 items-center justify-center rounded-xl bg-gradient-to-r from-primary to-secondary"
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        transition={{ type: 'spring', stiffness: 400 }}
                      >
                        <Icon className="text-primary-foreground" size={24} />
                      </motion.div>
                      <h3 className={`${isPortrait ? 'text-lg' : 'text-xl'} mb-2 font-semibold text-foreground`}>{feature.title}</h3>
                      <p className={`${isPortrait ? 'text-sm' : ''} text-foreground-secondary`}>{feature.description}</p>
                    </motion.div>
                  </PremiumCard>
                </motion.div>
              );
            })}
          </ResponsiveGrid>

          {/* Trading Pairs Showcase */}
          <motion.div className={isPortrait ? 'mb-8' : 'mb-24'} variants={itemVariants}>
            <h2 className={`${isPortrait ? 'text-2xl' : 'text-3xl'} mb-2 text-center font-bold text-foreground`}>Reference pairs</h2>
            <p className="mb-6 text-center text-sm text-foreground-secondary">Symbols are navigation shortcuts, not live market quotes.</p>
            <ResponsiveGrid portraitCols={2} landscapeCols={4} gap={isPortrait ? '2' : '4'}>
              {['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT'].map((pair, i) => (
                <PremiumCard
                  key={i}
                  hoverEffect="scale"
                  className={`${isPortrait ? 'p-3' : 'p-4'} cursor-pointer text-center`}
                  onClick={navigationLinks.trading}
                >
                  <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <div className={`${isPortrait ? 'text-sm' : ''} font-semibold text-foreground`}>{pair}</div>
                    <div className={`mt-2 font-semibold text-foreground-secondary ${isPortrait ? 'text-xs' : 'text-sm'}`}>Open workspace</div>
                  </motion.div>
                </PremiumCard>
              ))}
            </ResponsiveGrid>
          </motion.div>

          {/* CTA Section */}
          <motion.div
            className={`${isPortrait ? 'p-6' : 'p-12'} terminal-panel bg-gradient-to-r from-primary/15 to-secondary/15 text-center`}
            variants={itemVariants}
            whileHover={{ borderColor: 'rgba(255, 255, 255, 0.3)' }}
            transition={{ duration: 0.3 }}
          >
            <motion.h3 
              className={`${isPortrait ? 'text-2xl' : 'text-3xl'} mb-3 font-bold text-foreground`}
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              Ready to trade with clarity?
            </motion.h3>
            <p className={`${isPortrait ? 'mb-4 text-sm' : 'mx-auto mb-6 max-w-xl'} text-foreground-secondary`}>
              Move between research and preview workflows with transparent data and service boundaries.
            </p>
            <PremiumButton 
              onClick={() => setLocation('/kyc')}
              variant="primary"
              className={`${isPortrait ? 'w-full' : ''} rounded-xl px-8 py-4`}
            >
              Review verification preview
            </PremiumButton>
          </motion.div>
        </motion.section>
      </ResponsiveContainer>

      {/* Footer */}
      <motion.footer 
        className="relative z-10 mt-12 border-t border-border bg-card/40 backdrop-blur-md"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <ResponsiveContainer portraitPadding="px-4 py-8" landscapePadding="px-8 py-12">
          <div className={`mb-8 grid ${isPortrait ? 'grid-cols-2 gap-4' : 'grid-cols-4 gap-8'}`}>
            {[
              {
                title: 'Product',
                links: [
                  { label: 'Trading', action: navigationLinks.trading },
                  { label: 'Wallet', action: navigationLinks.wallet },
                  { label: 'Earn', action: navigationLinks.earn },
                ]
              },
              {
                title: 'Company',
                links: [
                  { label: 'About', action: () => setLocation('/') },
                  { label: 'Blog', action: () => setLocation('/') },
                  { label: 'Careers', action: () => setLocation('/') },
                ]
              },
              ...(isLandscape ? [{
                title: 'Legal',
                links: [
                  { label: 'Terms', action: () => setLocation('/') },
                  { label: 'Privacy', action: () => setLocation('/') },
                  { label: 'Security', action: navigationLinks.security },
                ]
              },
              {
                title: 'Social',
                links: [
                  { label: 'Twitter', action: () => setLocation('/') },
                  { label: 'Discord', action: () => setLocation('/') },
                  { label: 'Telegram', action: () => setLocation('/') },
                ]
              }] : []),
            ].map((section, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <h4 className={`${isPortrait ? 'text-sm' : ''} mb-3 font-semibold text-foreground`}>{section.title}</h4>
                <ul className={`space-y-2 text-foreground-secondary ${isPortrait ? 'text-xs' : 'text-sm'}`}>
                  {section.links.map((link, j) => (
                    <motion.li
                      key={j}
                      whileHover={{ x: 4, color: 'var(--foreground)' }}
                      transition={{ duration: 0.2 }}
                    >
                      <button type="button" onClick={link.action} className="rounded-sm transition hover:text-foreground focus-visible:outline-none">
                        {link.label}
                      </button>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
          <PremiumDivider className="mb-6" />
          <motion.div 
            className={`flex ${isPortrait ? 'flex-col gap-3 text-center' : 'flex-row justify-between items-center'}`}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
          >
            <p className={`text-foreground-secondary ${isPortrait ? 'text-xs' : 'text-sm'}`}>© 2026 Nexus. All rights reserved.</p>
            <div className={`text-foreground-secondary ${isPortrait ? 'text-xs' : 'text-sm'}`}>Built for precise decision-making.</div>
          </motion.div>
        </ResponsiveContainer>
      </motion.footer>
    </div>
  );
}
