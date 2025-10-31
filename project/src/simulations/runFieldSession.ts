import { fieldSessionSimulation } from './fieldSessionSimulation';

/**
 * Main function to run the field session simulation
 */
async function main() {
  console.log('🚀 Starting Field Session Simulation\n');
  
  try {
    // Run the complete simulation
    await fieldSessionSimulation.run();
    
    console.log('\n✅ Simulation completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Simulation failed:', error);
    process.exit(1);
  }
}

// Run the main function
main();
